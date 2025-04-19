<!-- src/App.vue -->
<template>
  <div class="container">
    <h1>MCP Vue Web Client</h1>
    <section>
      <h2>Available Tools</h2>
      <ul>
        <li v-for="tool in tools" :key="tool.name">{{ tool.name }}</li>
      </ul>
    </section>
    <section class="chat-container">
      <div class="messages">
        <div
          v-for="(message, index) in chatHistory"
          :key="index"
          :class="['message', message.role]"
        >
          <strong>{{ message.role }}:</strong> {{ message.content }}
        </div>
      </div>
      <form @submit.prevent="submitQuery">
        <label for="queryInput">Enter message:</label>
        <input
          id="queryInput"
          v-model="inputText"
          type="text"
          placeholder="Type your message here"
        />
        <button type="submit">Send</button>
      </form>
    </section>
  </div>
</template>

<script lang="ts">
import { MCPHost } from "./mcpHost";
import { type Message } from "ollama";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export default {
  name: "App",
  data() {
    return {
      mcpHost: new MCPHost(),
      tools: [] as Tool[],
      inputText: "",
      isLoading: false,
      chatHistory: [] as Message[],
    };
  },
  methods: {
    async initializeMCPHost() {
      try {
        await this.mcpHost.initializeMCPClient(
          import.meta.env.VITE_MCP_SERVER_ENDPOINT
        );
        console.log("MCP Client initialized successfully.");
        this.tools = this.mcpHost.getAllTools();
        console.log("MCP Host initialized with tools:", this.tools);
      } catch (error) {
        console.error("Error initializing MCP client:", error);
      }
      this.mcpHost.startNewChat();
    },
    async submitQuery() {
      console.log("Submitting query:", this.inputText);
      if (!this.mcpHost || this.inputText.trim() === "") {
        return;
      }

      this.isLoading = true;

      // Add the user message to the chat history
      this.chatHistory.push({
        role: "user",
        content: this.inputText,
      });

      try {
        const result = await this.mcpHost.processQuery("1", this.inputText);

        // Add the assistant's response to the chat history
        this.chatHistory.push({
          role: "assistant",
          content: result,
        });
      } catch (error) {
        console.error("Error processing query:", error);

        // Add error message to chat
        this.chatHistory.push({
          role: "assistant",
          content: "Error processing query.",
        });
      } finally {
        this.isLoading = false;
        this.inputText = ""; // Clear input field after sending
      }
    },
    async cleanupClient() {},
  },
  mounted() {
    this.initializeMCPHost();
  },
  beforeUnmount() {
    this.cleanupClient();
  },
};
</script>

<style scoped>
.container {
  max-width: 800px;
  margin: 2rem auto;
  padding: 1rem;
  font-family: sans-serif;
}

section {
  margin-bottom: 2rem;
}

.chat-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.message {
  padding: 0.5rem;
  border-radius: 4px;
}

.message.user {
  color: black;
  background-color: #e6f7ff;
  align-self: flex-end;
  margin-left: 20%;
}

.message.assistant {
  color: black;
  background-color: #f0f0f0;
  align-self: flex-start;
  margin-right: 20%;
}

input[type="text"] {
  padding: 0.5rem;
  width: 100%;
  max-width: 400px;
}

button {
  margin-top: 0.5rem;
  padding: 0.5rem 1rem;
}
</style>
