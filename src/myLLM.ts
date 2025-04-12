// src/myLLM.ts
export interface LLMOptions {
  maxTokens?: number;
  toolsPrompt?: string;
}

export interface LLMResponse {
  id: string;
  role: string;
  content: string;
}

export interface MessageParam {
  role: "user" | "assistant" | "tool" | "system";
  content: { type: "text"; text: string };
}

export class LLMClient {
  async sendMessage(
    messages: MessageParam[],
    options: LLMOptions = {}
  ): Promise<LLMResponse> {
    // Build a prompt that includes both the tools info and conversation
    let prompt = options.toolsPrompt || "";

    // Add conversation messages
    for (const msg of messages) {
      prompt += `${msg.role}: ${msg.content.text}\n`;
    }

    console.log("LLM prompt:", prompt);

    try {
      const response = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt,
          model: "llama3.1:8b", // Adjust if necessary
          stream: false,
          max_tokens: options.maxTokens || 1000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `LLM request failed with status ${response.status}: ${errorText}`
        );
      }

      const data = await response.json();

      return {
        id: "llm_" + Date.now(),
        role: "assistant",
        content: data.response || data.text || "",
      };
    } catch (error) {
      console.error("Error sending request to LLM:", error);
      throw error;
    }
  }
}
