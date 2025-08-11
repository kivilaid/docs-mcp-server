/**
 * Configuration interface for the AppServer.
 * Defines which services should be enabled and their configuration options.
 */

export interface AppServerConfig {
  /** Enable web interface routes and static file serving */
  enableWebInterface: boolean;

  /** Enable MCP protocol routes for AI tool integration */
  enableMcpServer: boolean;

  /** Enable API server (tRPC at /api) for programmatic access */
  enableApiServer: boolean;

  /** Enable embedded worker for job processing */
  enableWorker: boolean;

  /** Port to run the server on */
  port: number;

  /** URL of external worker server (if using external worker instead of embedded) */
  externalWorkerUrl?: string;
}
