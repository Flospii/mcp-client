import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { LLMClient } from "./llmClient";
import { MCPClient } from "./mcpClient";
import { type Message, type ToolCall } from "ollama";

// This is the system prompt that initializes the conversation
// It should be in the same language as the user
// and should provide context to the LLM.
const systemPrompt =
  "You are a helpful, precise and friendly assistant. " +
  "You have access to various tools to obtain information and complete tasks. " +
  "IMPORTANT RULES FOR TOOL USE:" +
  "1. use tools whenever it makes sense to get current or specific information. " +
  "2. read the tool description carefully to understand how to access it correctly. " +
  "3. format tool calls exactly as required. " +
  "4. if a tool call fails, do not retry with identical parameters. " +
  " " +
  " If you are unsure or need more context, politely ask the user for more information. " +
  " " +
  "Your answers should: " +
  "- Be precise and factual " +
  "- Be well structured and easy to understand " +
  "- Be based on tool results and your knowledge " +
  "- Do not contain false information (admit if you don't know something) " +
  " " +
  "Think step by step before answering. ";

export interface Conversation {
  id: string;
  createdAt: number;
  conversationHistory: Message[];
}

export class MCPHost {
  private mcpClients: MCPClient[];
  private conversations: Conversation[];
  private llm: LLMClient;

  constructor() {
    this.mcpClients = [];
    this.conversations = [];
    this.llm = new LLMClient(
      import.meta.env.VITE_LLM_SERVER_ENDPOINT,
      import.meta.env.VITE_LLM_MODEL
    );
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
      conversationHistory: [
        {
          // This is the system message that initializes the conversation
          // and provides context to the LLM.
          role: "system",
          content: systemPrompt,
        },
      ],
    };
    console.log("New chat started:", newChat);
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
      content: query,
    });

    // Send the query to the LLM
    const response = await this.llm.sendMessage(
      conversation.conversationHistory,
      this.getAllTools()
    );

    if (!response) {
      throw new Error("LLM response is empty.");
    }

    // Check if the response contains a tool call
    if (response.toolCalls) {
      // If a tool call is detected, process it
      const processedResponse = await this.processToolCall(
        conversation,
        response.toolCalls
      );
      // Add the LLM response to the conversation history
      conversation.conversationHistory.push({
        role: "assistant",
        content: processedResponse,
      });
      // Return the processed response
      return processedResponse;
    } else {
      // No tool call detected, just return the LLM response
      // Add the LLM response to the conversation history
      conversation.conversationHistory.push({
        role: "assistant",
        content: response.content,
      });
      // Return the LLM response

      return response.content;
    }
  }

  private async processToolCall(
    conversation: Conversation,
    toolCalls: ToolCall[]
  ): Promise<string> {
    for (const toolCall of toolCalls) {
      // Find the client that has the tool
      const client = this.mcpClients.find((c) =>
        c.getTools().some((tool) => tool.name === toolCall.function.name)
      );
      if (client) {
        try {
          const toolResponse = await client.getClient().callTool({
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          });
          console.log(
            `Tool response from ${toolCall.function.name}:`,
            toolResponse
          );
          // Add the tool response to the conversation history
          conversation.conversationHistory.push({
            role: "tool",
            content: JSON.stringify(toolResponse),
          });
        } catch (error) {
          console.error(`Error calling tool ${toolCall.function.name}:`, error);
          // Füge Fehlermeldung zur Konversation hinzu
          const errorMessage =
            typeof error === "object" && error !== null && "message" in error
              ? (error as Error).message
              : String(error);
          conversation.conversationHistory.push({
            role: "tool",
            content: JSON.stringify({
              error: `Failed to call tool: ${errorMessage}`,
            }),
          });
        }
      } else {
        throw new Error(
          `Tool "${toolCall.function.name}" not found in any MCP client.`
        );
      }
    }

    // Call the llm again with the tool response
    const response = await this.llm.sendMessage(
      conversation.conversationHistory
    );

    if (!response) {
      throw new Error("LLM response is empty.");
    }

    return response.content;
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
