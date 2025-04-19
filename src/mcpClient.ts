import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * MCPClient class to interact with the Model Context Protocol (MCP) server.
 * This is a 1-to-1 connection, a client that connects to a single MCP server.
 */
export class MCPClient {
  private mcp: Client;
  private transport: SSEClientTransport;
  private tools: Tool[];

  constructor(serverEndpoint: string) {
    this.mcp = new Client({
      name: "mcp-client",
      version: "1.0.0",
      capabilities: {
        sampling: {},
      },
    });
    this.transport = new SSEClientTransport(new URL(serverEndpoint));
    this.tools = [];
  }

  // Connect to the MCP server and fetch available tools with timeout.
  public async connectToServer(timeoutMs: number = 5000): Promise<void> {
    try {
      // Create a promise that rejects after timeoutMs
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(`Connection to MCP server timed out after ${timeoutMs}ms`)
          );
        }, timeoutMs);
      });

      // Race between the connection attempt and the timeout
      await Promise.race([
        (async () => {
          await this.mcp.connect(this.transport);
          // Fetch the list of tools from the MCP server
          const toolsResult = await this.mcp.listTools();
          this.tools = toolsResult.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          }));
        })(),
        timeoutPromise,
      ]);
    } catch (error) {
      console.error("Error connecting to MCP server:", error);
      throw new Error(`Failed to connect to MCP server: ${error}`);
    }
  }

  public async close(): Promise<void> {
    await this.mcp.close();
  }

  getTools(): Tool[] {
    return this.tools;
  }

  getClient(): Client {
    return this.mcp;
  }
}
