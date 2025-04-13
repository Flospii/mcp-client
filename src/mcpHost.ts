import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { LLMClient, type MessageParam } from "./llmClient";
import { MCPClient } from "./mcpClient";

export interface Conversation {
  id: string;
  createdAt: number;
  conversationHistory: MessageParam[];
}

const toolCallRegex = /TOOL_CALL:([a-zA-Z0-9_-]+):({.*})/;

export class MCPHost {
  private mcpClients: MCPClient[];
  private conversations: Conversation[];
  private llm: LLMClient;

  constructor() {
    this.mcpClients = [];
    this.conversations = [];
    this.llm = new LLMClient();
  }

  async initializeMCPClient(serverEndpoint: string): Promise<void> {
    try {
      const client = await new MCPClient(serverEndpoint);
      await client.connectToServer();
      this.mcpClients.push(client);
    } catch (error) {
      console.error("Error initializing MCP client:", error);
      throw new Error(`Failed to initialize MCP client: ${error}`);
    }
  }

  startNewChat(): Conversation {
    const newChat: Conversation = {
      id: (this.conversations.length + 1).toString(),
      createdAt: Date.now(),
      conversationHistory: [],
    };
    this.conversations.push(newChat);
    return newChat;
  }

  getConversationById(conversationId: string): Conversation | undefined {
    return this.conversations.find(
      (conversation) => conversation.id === conversationId
    );
  }

  public async processQuery(
    conversationId: string,
    query: string
  ): Promise<string> {
    // Find the conversation by ID to get the conversation history
    const conversation = this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation with ID ${conversationId} not found.`);
    }

    // Add the user message to the conversation history
    conversation.conversationHistory.push({
      role: "user",
      content: { type: "text", text: query },
    });

    // Create a prompt that includes the tools available from all MCP clients
    let toolsPrompt = "";
    for (const mcpClient of this.mcpClients) {
      const tools = mcpClient.getTools();
      if (tools.length > 0) {
        toolsPrompt = "\nAvailable tools:\n";
        for (const tool of tools) {
          toolsPrompt += `- ${tool.name}: ${
            tool.description || "No description"
          }\n`;
          if (tool.inputSchema) {
            toolsPrompt += `  Input schema: ${JSON.stringify(
              tool.inputSchema,
              (key, value) =>
                ["$schema", "additionalProperties"].includes(key)
                  ? undefined
                  : value
            )}\n`;
          }
        }
      }
      toolsPrompt +=
        "\nTo use a tool, respond with: TOOL_CALL:toolName:toolArguments (as JSON)\n";
    }

    // Send the query to the LLM
    const response = await this.llm.sendMessage(
      conversation.conversationHistory,
      {
        toolsPrompt,
      }
    );

    if (!response) {
      throw new Error("LLM response is empty.");
    }

    // Check if the response contains a tool call
    const toolCallMatch = this.isToolCallInQuery(response.content);
    if (toolCallMatch) {
      // If a tool call is detected, process it
      const processedResponse = this.processToolCall(
        conversation,
        response.content
      );
      // Add the LLM response to the conversation history
      conversation.conversationHistory.push({
        role: "assistant",
        content: { type: "text", text: response.content },
      });
      // Return the processed response
      return processedResponse;
    } else {
      // No tool call detected, just return the LLM response
      // Add the LLM response to the conversation history
      conversation.conversationHistory.push({
        role: "assistant",
        content: { type: "text", text: response.content },
      });
      // Return the LLM response

      return response.content;
    }
  }

  private isToolCallInQuery(query: string): boolean {
    // Check if the query contains a tool call
    return toolCallRegex.test(query);
  }

  private getToolCallsFromQuery(
    query: string
  ): { name: string; args: object }[] {
    // Extract all tool calls from the query
    const toolCalls: { name: string; args: object }[] = [];
    let match;
    // TODO: Sometimes the llm gives just for example "get-weather:{"city":"Linz"}" back. No TOOL_CALL: prefix.
    while ((match = toolCallRegex.exec(query)) !== null) {
      const toolName = match[1];
      const toolArgs = JSON.parse(match[2]);
      toolCalls.push({ name: toolName, args: toolArgs });
      // Remove the matched part to avoid infinite loops
      query = query.slice(match.index + match[0].length);
    }
    return toolCalls;
  }

  private async processToolCall(
    conversation: Conversation,
    query: string
  ): Promise<string> {
    // Extract the tool call from the query
    const toolCalls = this.getToolCallsFromQuery(query);
    if (!toolCalls) {
      throw new Error("Invalid tool call in query.");
    }
    for (const { name: toolName, args: toolArgs } of toolCalls) {
      // Find the client that has the tool
      const client = this.mcpClients.find((c) =>
        c.getTools().some((tool) => tool.name === toolName)
      );
      if (client) {
        // Call the tool with the arguments
        const toolResponse = await client.getClient().callTool({
          name: toolName,
          arguments: toolArgs as { [x: string]: unknown },
        });
        // Add the tool response to the conversation history
        conversation.conversationHistory.push({
          role: "tool",
          content: { type: "text", text: JSON.stringify(toolResponse) },
        });

        // Create a specific prompt for the follow-up
        const toolResultText = (toolResponse.content as { text: string }[])[0]
          .text;
        const followUpPrompt = `You previously called the tool ${toolName} with arguments ${JSON.stringify(
          toolArgs
        )}. The tool returned this result: ${toolResultText}. Please provide a helpful response to the user based on this information in users language.`;

        // Add the follow-up prompt to the conversation history
        conversation.conversationHistory.push({
          role: "system",
          content: { type: "text", text: followUpPrompt },
        });
      } else {
        throw new Error(`Tool "${toolName}" not found in any MCP client.`);
      }
    }

    // Call the llm again with the tool response
    const response = await this.llm.sendMessage(
      conversation.conversationHistory
    );

    if (!response) {
      throw new Error("LLM response is empty.");
    }

    // Check if the response contains a tool call
    const toolCallMatch = this.isToolCallInQuery(response.content);
    if (toolCallMatch) {
      // If a tool call is detected, process it
      return this.processToolCall(conversation, response.content);
    } else {
      // No more tool calls, return the lfinal response
      return response.content;
    }
  }

  getMCPClients(): MCPClient[] {
    return this.mcpClients;
  }

  getAllTools(): Tool[] {
    const allTools: Tool[] = [];
    for (const client of this.mcpClients) {
      const tools = client.getTools();
      allTools.push(...tools);
    }
    return allTools;
  }
}
