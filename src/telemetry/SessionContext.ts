/**
 * Session context interface for different interface types
 */
export interface SessionContext {
  sessionId: string;
  interface: "mcp" | "cli" | "web" | "pipeline";
  startTime: Date;
  version: string;
  platform: string;
  nodeVersion?: string;

  // Interface-specific context
  command?: string; // CLI: command name
  protocol?: "stdio" | "http"; // MCP: protocol type
  transport?: "sse" | "streamable"; // MCP: transport mode
  route?: string; // Web: current route

  // Configuration context
  authEnabled: boolean;
  readOnly: boolean;
  servicesEnabled: string[];
}
