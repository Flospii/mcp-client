// src/myLLM.ts
export interface LLMOptions {
  maxTokens?: number;
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
    // Build a prompt by joining each message as "role: text"
    const prompt = messages
      .map((msg) => `${msg.role}: ${msg.content.text}`)
      .join("\n");
    console.log("LLM prompt:", prompt);

    console.log(
      "Sending request to LLM...",
      JSON.stringify({
        prompt,
        model: "llama3.1:8b", // Adjust if necessary.
        stream: false,
      })
    );

    const response = await fetch(
      "http://host.docker.internal:11434/api/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          model: "llama3.1:8b", // Adjust if necessary.
          stream: false,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `LLM request failed with status ${response.status}: ${errorText}`
      );
    }

    const data = await response.json();
    console.log("LLM response data:", data);

    return {
      id: "llm_" + Date.now(),
      role: "assistant",
      content: data.text || "",
    };
  }
}
