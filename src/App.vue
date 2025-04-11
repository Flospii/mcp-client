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
        client.value = await createMcpClient();
        // List available tools.
        const toolsResult = await client.value.listTools();
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
        // For demonstration, we assume the MCP server has an "echo" tool.
        // Adjust the tool name and parameters as needed.
        const result = await client.value.callTool({
          name: "echo",
          arguments: { message: inputText.value }
        });
        const textResult = result.content
          .filter((item: any) => item.type === "text")
          .map((item: any) => item.text)
          .join("\n");
        responseText.value = textResult;
      } catch (error) {
        console.error("Error calling tool:", error);
        responseText.value = "Error calling tool.";
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
  background: #f0f0f0;
  padding: 1rem;
  overflow-x: auto;
}
</style>
