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
    <section>
      <form @submit.prevent="submitQuery">
        <label for="queryInput">Enter message:</label>
        <input id="queryInput" v-model="inputText" type="text" placeholder="Type your message here" />
        <button type="submit">Send</button>
      </form>
    </section>
    <div class="response-container">
      <div v-if="responseText" :class="{ loading: isLoading }">
        {{ responseText }}
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { MCPClient } from "./mcpClient";

export default {
  name: "App",
  data() {
    return {
      mcpClient: null as MCPClient | null,
      tools: [] as Array<{ name: string; description?: string; inputSchema?: unknown }>,
      inputText: "",
      responseText: "",
      isLoading: false,
    };
  },
  methods: {
    async initializeClient() {
      try {
        console.log("Initializing MCP client...");
        const client = new MCPClient();
        await client.connectToServer();
        this.mcpClient = client;
        this.tools = client.getTools();
        console.log("MCP client initialized with tools:", this.tools.map((tool) => tool.name));
      } catch (error) {
        console.error("Error initializing MCP client:", error);
      }
    },
    async submitQuery() {
      console.log("Submitting query:", this.inputText);
      if (!this.mcpClient || this.inputText.trim() === "") {
        return;
      }
      this.isLoading = true;
      try {
        const result = await this.mcpClient.processQuery(this.inputText);
        this.responseText = result;
      } catch (error) {
        console.error("Error processing query:", error);
        this.responseText = "Error processing query.";
      } finally {
        this.isLoading = false;
      }
    },
    async cleanupClient() {
      if (this.mcpClient) {
        await this.mcpClient.close();
      }
    },
  },
  mounted() {
    this.initializeClient();
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

input[type="text"] {
  padding: 0.5rem;
  width: 100%;
  max-width: 400px;
}

button {
  margin-top: 0.5rem;
  padding: 0.5rem 1rem;
}

.response-container {
  margin-top: 1rem;
}

.loading {
  opacity: 0.7;
}
</style>
