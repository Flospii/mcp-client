// src/transport/HttpSseClientTransport.ts
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export interface McpMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
}

export class HttpSseClientTransport implements Transport {
  private endpoint: URL;
  private eventSource?: EventSource;
  private messageHandler?: (message: McpMessage) => void;
  private errorHandler?: (error: Event) => void;
  private openHandler?: (event: Event) => void;
  public sessionId?: string;
  private reconnectInterval: number = 5000;

  constructor(endpoint: string) {
    this.endpoint = new URL(endpoint);
  }

  /**
   * Starts the transport connection and returns a promise that resolves when the connection is open.
   */
  start(): Promise<void> {
    return this.startListening();
  }

  /**
   * Initiates the EventSource connection and returns a promise that resolves when the connection is open.
   */
  startListening(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.eventSource = new EventSource(this.endpoint.href);

      this.eventSource.onopen = (event) => {
        console.log("SSE connection established.");
        if (this.openHandler) {
          this.openHandler(event);
        }
        resolve();
      };

      this.eventSource.onmessage = (event: MessageEvent<string>) => {
        try {
          const msg: McpMessage = JSON.parse(event.data);
          if (this.messageHandler) {
            this.messageHandler(msg);
          }
        } catch (error) {
          console.error("Error parsing SSE message:", error);
        }
      };

      this.eventSource.onerror = (event) => {
        console.error("EventSource encountered an error:", event);
        if (this.errorHandler) {
          this.errorHandler(event);
        }
        if (
          this.eventSource &&
          this.eventSource.readyState === EventSource.CLOSED
        ) {
          console.warn(
            `SSE connection closed. Attempting reconnection in ${this.reconnectInterval}ms...`
          );
          this.reconnect();
        }
      };

      setTimeout(() => {
        if (
          this.eventSource &&
          this.eventSource.readyState !== EventSource.OPEN
        ) {
          reject(new Error("SSE connection timeout."));
        }
      }, 10000);
    });
  }

  private reconnect() {
    this.close();
    setTimeout(() => {
      this.startListening().catch((error) => {
        console.error("Reconnection attempt failed:", error);
      });
    }, this.reconnectInterval);
  }

  /**
   * Sends an MCP JSON-RPC message via HTTP POST.
   */
  async send(message: McpMessage): Promise<void> {
    // Create a deep copy of the message to avoid modifying the original
    const messageToSend = JSON.parse(JSON.stringify(message));

    // Ensure it's properly formatted as JSON-RPC 2.0
    if (!messageToSend.jsonrpc) {
      messageToSend.jsonrpc = "2.0";
    }

    const requestBody = JSON.stringify(messageToSend);
    console.log("Sending exact request body:", requestBody);

    try {
      const response = await fetch(this.endpoint.href, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(this.sessionId ? { "MCP-Session-Id": this.sessionId } : {}),
        },
        body: requestBody,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HTTP error ${response.status}: ${errorText}`);
        throw new Error(`HTTP error: ${response.status}`);
      }

      // Log successful response if any
      if (response.headers.get("content-type")?.includes("application/json")) {
        const responseData = await response.json();
        console.log("Server response:", responseData);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      throw error;
    }
  }

  /**
   * Sets the incoming message handler.
   */
  onMessage(handler: (message: McpMessage) => void): void {
    this.messageHandler = handler;
  }

  /**
   * Sets a custom error handler for SSE errors.
   */
  onError(handler: (error: Event) => void): void {
    this.errorHandler = handler;
  }

  /**
   * Sets a handler that is called when the SSE connection is successfully opened.
   */
  onOpen(handler: (event: Event) => void): void {
    this.openHandler = handler;
  }

  /**
   * Updates the session ID which will be included in outgoing HTTP requests.
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Closes the EventSource connection.
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = undefined;
        console.log("SSE connection closed.");
      }
      resolve();
    });
  }
}
