// src/mcpClient.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type {
  Tool,
  CreateMessageRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { LLMClient, type MessageParam, type LLMResponse } from "./myLLM";

const MCP_SERVER_ENDPOINT = "http://localhost:3001/mcp";

export class MCPClient {
  private mcp: Client;
  private transport: SSEClientTransport;
  private llm: LLMClient;
  private tools: Tool[];

  constructor() {
    // Advertise the sampling capability so that the server knows that the client supports LLM sampling.
    this.mcp = new Client({
      name: "vue-mcp-client",
      version: "1.0.0",
      capabilities: {
        sampling: {},
      },
    });
    this.transport = new SSEClientTransport(new URL(MCP_SERVER_ENDPOINT));
    this.llm = new LLMClient();
    this.tools = [];
  }

  // Connect to the MCP server and fetch available tools.
  public async connectToServer(): Promise<void> {
    // Note: client.connect() automatically calls transport.start() internally.
    await this.mcp.connect(this.transport);
    const toolsResult = await this.mcp.listTools();
    this.tools = toolsResult.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
    console.log(
      "Connected. Tools available:",
      this.tools.map((t) => t.name)
    );
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

  // Process the user query by sending a sampling/createMessage request to the LLM.
  public async processQuery(query: string): Promise<string> {
    // Build the initial conversation with the user's query.
    let messages: MessageParam[] = [
      { role: "user", content: { type: "text", text: query } },
    ];

    // Call the LLM.
    const llmResponse: LLMResponse = await this.llm.sendMessage(messages, {
      maxTokens: 100,
    });
    console.log("LLM raw response:", llmResponse);

    // For demonstration: if the response starts with a tool call marker,
    // e.g., "CALL_TOOL:echo:{...}", then execute the tool via MCP.
    const toolCallPrefix = "CALL_TOOL:";
    let finalResponse = llmResponse.content;
    if (finalResponse.startsWith(toolCallPrefix)) {
      const splitIndex = finalResponse.indexOf(":", toolCallPrefix.length);
      if (splitIndex !== -1) {
        const toolName = finalResponse.substring(
          toolCallPrefix.length,
          splitIndex
        );
        const toolArgsStr = finalResponse.substring(splitIndex + 1);
        let toolArgs = {};
        try {
          toolArgs = JSON.parse(toolArgsStr);
        } catch (e) {
          console.error("Error parsing tool arguments:", e);
        }
        console.log(
          `LLM requested tool call: ${toolName} with args:`,
          toolArgs
        );
        // Call the tool via MCP.
        const toolResult = await this.mcp.callTool({
          name: toolName,
          arguments: toolArgs,
        });
        // Append the tool result to the conversation.
        messages.push({
          role: "assistant",
          content: { type: "text", text: llmResponse.content },
        });
        messages.push({
          role: "user",
          content: {
            type: "text",
            text: (toolResult.content as { text: string }[])[0].text,
          },
        });
        const followUpResponse = await this.llm.sendMessage(messages, {
          maxTokens: 100,
        });
        finalResponse = followUpResponse.content;
      }
    }

    return finalResponse;
  }
}
