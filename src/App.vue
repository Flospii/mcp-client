<!-- src/App.vue -->
<template>
  <div class="container">
    <h1>MCP Vue Web Client</h1>
    <section>
      <h2>Available Tools</h2>
      <ul>
        <li v-for="tool in tools" :key="tool">{{ tool }}</li>
      </ul>
    </section>
    <section>
      <form @submit.prevent="submitQuery">
        <label for="queryInput">Enter message (for echo tool):</label>
        <input id="queryInput" v-model="inputText" type="text" placeholder="Type your message here" />
        <button type="submit">Send</button>
      </form>
    </section>
    <section v-if="responseText">
      <h2>Response</h2>
      <pre>{{ responseText }}</pre>
    </section>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onBeforeUnmount } from "vue";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createMcpClient } from "./mcpClient";

export default defineComponent({
  name: "App",
  setup() {
    const client = ref<Client | null>(null);
    const tools = ref<string[]>([]);
    const inputText = ref("");
    const responseText = ref("");

    // Initialize the MCP client on mount.
    onMounted(async () => {
      try {
        console.log("Initializing MCP client...");
        client.value = await createMcpClient();
        // List available tools.
        console.log("Client initialized:", client.value);
        const toolsResult = await client.value.listTools();
        console.log("Available tools:", toolsResult.tools);
        tools.value = toolsResult.tools.map((tool: any) => tool.name);
      } catch (error) {
        console.error("Error initializing MCP client:", error);
      }
    });

    // Clean up the client on unmount.
    onBeforeUnmount(async () => {
      if (client.value) {
        await client.value.closeGracefully();
      }
    });

    // Handle form submission.
    const submitQuery = async () => {
      console.log("Submitting query:", inputText.value);

      if (!client.value || inputText.value.trim() === "") {
        return;
      }

      try {
        // Instead of calling a tool like "echo", we send a sampling request to the LLM.
        // The request method is "sampling/createMessage" and we provide the user's message in the params.
        const result = await client.value.request({
          method: "sampling/createMessage",
          params: {
            // A list of messages is used to build up context for the LLM.
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: inputText.value
                }
              }
            ],
            // Maximum tokens to return (adjust as needed).
            maxTokens: 256,
            // Temperature controls the randomness; adjust according to your requirements.
            temperature: 0.7,
            // Optionally, you can add a systemPrompt or modelPreferences.
          }
        });

        // Process the returned result: We assume that the response contains a "content" array
        // with one or more parts having type "text".
        const textResult = result.content
          .filter((item: any) => item.type === "text")
          .map((item: any) => item.text)
          .join("\n");

        responseText.value = textResult;
      } catch (error: any) {
        console.error("Error calling sampling/createMessage:", error);
        responseText.value = "Error calling LLM.";
      }
    };

    return {
      tools,
      inputText,
      responseText,
      submitQuery
    };
  }
});
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

pre {
  color: black;
  background: #f0f0f0;
  padding: 1rem;
  overflow-x: auto;
}
</style>
