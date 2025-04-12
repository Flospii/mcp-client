import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { LLMClient, type MessageParam, type LLMResponse } from "./myLLM";

const MCP_SERVER_ENDPOINT = "http://localhost:3001/mcp";

export class MCPClient {
  private mcp: Client;
  private transport: SSEClientTransport;
  private llm: LLMClient;
  private tools: Tool[];
  private conversationHistory: MessageParam[] = [];

  constructor() {
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
    await this.mcp.connect(this.transport);
    // Fetch the list of tools from the MCP server
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

  // Get the current conversation history
  getConversationHistory(): MessageParam[] {
    return [...this.conversationHistory];
  }

  // Clear the conversation history
  clearConversation(): void {
    this.conversationHistory = [];
  }

  // Process the user query by sending a request to the LLM and handling tool calls
  public async processQuery(query: string): Promise<string> {
    // Add the user message to the conversation history
    this.conversationHistory.push({
      role: "user",
      content: { type: "text", text: query },
    });

    // Create a prompt that includes the tools available
    let toolsPrompt = "";
    if (this.tools.length > 0) {
      toolsPrompt = "\nAvailable tools:\n";
      for (const tool of this.tools) {
        toolsPrompt += `- ${tool.name}: ${
          tool.description || "No description"
        }\n`;
        if (tool.inputSchema) {
          toolsPrompt += `  Input schema: ${JSON.stringify(
            tool.inputSchema
          )}\n`;
        }
      }
      toolsPrompt +=
        "\nTo use a tool, respond with: TOOL_CALL:toolName:toolArguments (as JSON)\n";
    }

    // Build the conversation history with the tools prompt
    let fullPrompt = toolsPrompt + "\n";

    // Add conversation history to the prompt
    for (const msg of this.conversationHistory) {
      fullPrompt += `${msg.role}: ${msg.content.text}\n`;
    }

    // Call the LLM with the conversation history and tools info
    const llmResponse: LLMResponse = await this.llm.sendMessage(
      this.conversationHistory,
      {
        maxTokens: 1000,
        toolsPrompt: toolsPrompt, // Pass tools info to LLM client
      }
    );

    console.log("LLM raw response:", llmResponse);

    // Parse the response for tool calls
    let finalResponse = llmResponse.content;

    console.log("LLM final response:", finalResponse);

    // Check for tool calls in the response
    // Format: TOOL_CALL:toolName:toolArguments
    const toolCallRegex = /TOOL_CALL:([a-zA-Z0-9_-]+):({.*})/;

    const match = finalResponse.match(toolCallRegex);

    console.log("Tool call match:", match);

    if (match) {
      const toolName = match[1];
      let toolArgs = {};

      try {
        toolArgs = JSON.parse(match[2]);
      } catch (e) {
        console.error("Error parsing tool arguments:", e);
      }

      console.log(`LLM requested tool call: ${toolName} with args:`, toolArgs);

      try {
        // Call the tool via MCP
        const toolResult = await this.mcp.callTool({
          name: toolName,
          arguments: toolArgs,
        });

        console.log("Tool call successful. Result:", toolResult);

        // Add the tool result to the conversation
        const toolResultText = (toolResult.content as { text: string }[])[0]
          .text;
        this.conversationHistory.push({
          role: "tool",
          content: { type: "text", text: toolResultText },
        });

        // Get a follow-up response from the LLM with the tool result
        // Create a specific prompt for the follow-up
        const followUpPrompt = `You previously called the tool ${toolName} with arguments ${JSON.stringify(
          toolArgs
        )}. 
The tool returned this result: ${toolResultText}
Please provide a helpful response to the user based on this information.`;

        const followUpMessages: MessageParam[] = [
          ...this.conversationHistory,
          { role: "system", content: { type: "text", text: followUpPrompt } },
        ];

        const followUpResponse = await this.llm.sendMessage(followUpMessages, {
          maxTokens: 1000,
        });

        // Update the final response to be the follow-up response
        finalResponse = followUpResponse.content;
      } catch (error) {
        console.error(`Failed to call tool ${toolName}:`, error);
        finalResponse = `Error calling tool "${toolName}": ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
      }
    }

    // Add the final assistant response to the conversation history
    this.conversationHistory.push({
      role: "assistant",
      content: { type: "text", text: finalResponse },
    });

    return finalResponse;
  }

  // Test the connection to both MCP server and LLM
  public async testConnection(): Promise<boolean> {
    try {
      // Test MCP connection
      const toolsResult = await this.mcp.listTools();
      console.log(
        "MCP connection test:",
        toolsResult.tools.length > 0 ? "Success" : "No tools found"
      );

      // Test LLM connection
      const testResponse = await this.llm.sendMessage(
        [
          {
            role: "user",
            content: { type: "text", text: "Simple test: say 'Hello'" },
          },
        ],
        { maxTokens: 10 }
      );
      console.log(
        "LLM connection test:",
        testResponse.content ? "Success" : "Failed"
      );

      return true;
    } catch (error) {
      console.error("Connection test failed:", error);
      return false;
    }
  }
}
