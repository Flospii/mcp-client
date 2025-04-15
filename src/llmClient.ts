// src/myLLM.ts
import {
  type ChatRequest,
  type Message,
  Ollama,
  type Tool,
  type ToolCall,
} from "ollama";
import type { Tool as mcpTool } from "@modelcontextprotocol/sdk/types.js";

export interface LLMResponse {
  role: string;
  content: string;
  toolCalls?: ToolCall[];
}

export class LLMClient {
  private ollama: Ollama;
  private model: string;

  constructor(llmServerEndpoint: string, model: string) {
    this.ollama = new Ollama({
      host: llmServerEndpoint,
    });
    this.model = model;
  }

  async sendMessage(
    messages: Message[],
    mcpTools?: mcpTool[]
  ): Promise<LLMResponse> {
    // Build ollama-compatible message format
    const ollamaMessages: Message[] = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Convert MCP tools to Ollama-compatible format
    const tools: Tool[] = mcpTools
      ? mcpTools.map(this.convertMCPToolToOllamaTool)
      : [];

    // Create Request
    const request: ChatRequest = {
      model: this.model,
      messages: ollamaMessages,
      stream: false,
      ...(tools.length ? { tools } : {}),
    };

    console.log("Tools (converted):", tools);
    console.log("Sending request to Ollama:", request);

    try {
      const response = await this.ollama.chat(
        request as ChatRequest & { stream: false }
      );

      console.log("Response from Ollama:", response);

      return {
        role: "assistant",
        content: response.message.content,
        toolCalls: response.message.tool_calls,
      };
    } catch (error) {
      console.error("Error sending request to Ollama:", error);
      throw error;
    }
  }

  private convertMCPToolToOllamaTool(mcp: mcpTool): Tool {
    const schema = mcp.inputSchema || { type: "object" };
    console.log("convertMCPToolToOllamaTool", mcp);

    const properties: Tool["function"]["parameters"]["properties"] = {};

    for (const [key, value] of Object.entries(schema.properties || {})) {
      const prop = value as {
        type: string;
        description?: string;
        enum?: string[];
      };

      properties[key] = {
        type: prop.type,
        description: prop.description || "",
        ...(prop.enum ? { enum: prop.enum } : {}),
      };
    }

    const required = Array.isArray(schema.required) ? schema.required : [];

    return {
      type: "function",
      function: {
        name: mcp.name,
        description: mcp.description || "No description",
        parameters: {
          type: "object",
          required,
          properties,
        },
      },
    };
  }
}
