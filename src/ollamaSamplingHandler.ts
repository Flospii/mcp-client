// src/ollamaSamplingHandler.ts
import type {
  CreateMessageRequest as BaseCreateMessageRequest,
  CreateMessageResult,
} from "@modelcontextprotocol/sdk/types.js"; // Use the correct path with .js extension

// Extend the CreateMessageRequest type to include systemPrompt
interface CreateMessageRequest extends BaseCreateMessageRequest {
  systemPrompt?: string;
}

// Define the sampling handler that will forward the sampling prompt to Ollama.
export async function ollamaSamplingHandler(
  request: CreateMessageRequest
): Promise<CreateMessageResult> {
  // Prepare the prompt by combining the system prompt (if provided) and the conversation messages.
  const promptParts = [];
  if (request.systemPrompt) {
    promptParts.push(request.systemPrompt);
  }
  for (const message of request.params.messages) {
    // Assume text content for simplicity.
    if (message.content && message.content.type === "text") {
      promptParts.push(message.content.text);
    }
  }
  const prompt = promptParts.join("\n\n");

  console.log("Sending prompt to Ollama:", prompt.substring(0, 100) + "...");

  // Send the sampling request to your Ollama LLM.
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: prompt,
      model: "llama3.1:8b",
      max_tokens: (request.params?.maxTokens as number) || 1000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Ollama request failed (${response.status}): ${errorText}`);
    throw new Error(`Ollama request failed: ${response.status}`);
  }

  // Parse the response
  const data = await response.json();
  console.log("Received response from Ollama:", data);

  // Extract the generated text based on Ollama's response format
  const generatedText = data.response || data.text || "No output";

  // Return the result in the MCP format (as a plain object, not using 'new')
  return {
    role: "assistant",
    content: {
      type: "text",
      text: generatedText,
    },
  } as CreateMessageResult;
}
