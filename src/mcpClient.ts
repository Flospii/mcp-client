// src/mcpClient.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ollamaSamplingHandler } from "./ollamaSamplingHandler";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { CreateMessageRequest } from "@modelcontextprotocol/sdk/types.js";

/**
 * Creates and connects an MCP client using our custom HTTP SSE transport.
 */
export async function createMcpClient(): Promise<Client> {
  // Replace with your MCP server HTTP endpoint.
  const MCP_SERVER_ENDPOINT = "http://localhost:3001/mcp";

  // Create the transport instance.
  const transport = new SSEClientTransport(new URL(MCP_SERVER_ENDPOINT));

  console.log("Connecting to MCP server at:", MCP_SERVER_ENDPOINT);

  // Set up message handling on the transport.
  transport.onmessage = (event) => {
    // The event may be a string or an already-parsed object.
    const message = typeof event === "string" ? JSON.parse(event) : event;

    // Check if this is a sampling/createMessage request.
    if (message.method === "sampling/createMessage" && message.params) {
      // Process the request with the custom sampling handler.
      ollamaSamplingHandler(message.params as CreateMessageRequest)
        .then((result) => {
          // Send the result back to the server.
          transport.send({
            jsonrpc: "2.0",
            id: message.id,
            method: "sampling/createMessage",
            result,
          });
        })
        .catch((error) => {
          // Send error details back if something goes wrong.
          transport.send({
            jsonrpc: "2.0",
            id: message.id,
            method: "sampling/createMessage",
            error: {
              code: -32000,
              message: error.message || "Internal error",
            },
          });
        });
    }
  };

  // Create a new MCP client instance with the desired capabilities.
  const client = new Client({
    name: "vue-mcp-client",
    version: "1.0.0",
    capabilities: {
      messageService: {
        createMessage: true, // Enable the createMessage capability.
      },
    },
  });

  // Connect the MCP client using the custom HTTP SSE transport.
  // Note: client.connect() automatically calls transport.start() internally.
  await client.connect(transport);

  return client;
}
