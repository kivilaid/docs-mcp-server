/**
 * Session context interface for different interface types
 */
export interface SessionContext {
  startTime: Date;
  sessionId: string;

  appInterface: "mcp" | "cli" | "web" | "pipeline";
  appVersion: string;
  appPlatform: string;
  appNodeVersion?: string;

  // Configuration context
  appAuthEnabled: boolean;
  appReadOnly: boolean;
  appServicesEnabled: string[];

  // Interface-specific context
  cliCommand?: string; // CLI: command name
  mcpProtocol?: "stdio" | "http"; // MCP: protocol type
  mcpTransport?: "sse" | "streamable"; // MCP: transport mode
  webRoute?: string; // Web: current route

  // Embedding model context
  aiEmbeddingProvider?: string; // "openai", "google", "aws", "microsoft"
  aiEmbeddingModel?: string; // "text-embedding-3-small", "text-embedding-004", etc.
  aiEmbeddingDimensions?: number; // Actual embedding dimensions used
}
