/**
 * Central application server that can be configured to run different combinations of services.
 * This replaces the separate server implementations with a single, modular approach.
 */

import path from "node:path";
import formBody from "@fastify/formbody";
import fastifyStatic from "@fastify/static";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Fastify, { type FastifyInstance } from "fastify";
import { ProxyAuthManager } from "../auth";
import type { IPipeline } from "../pipeline/trpc/interfaces";
import { cleanupMcpService, registerMcpService } from "../services/mcpService";
import { registerTrpcService } from "../services/trpcService";
import { registerWebService } from "../services/webService";
import { registerWorkerService, stopWorkerService } from "../services/workerService";
import type { IDocumentManagement } from "../store/trpc/interfaces";
import { logger } from "../utils/logger";
import { getProjectRoot } from "../utils/paths";
import type { AppServerConfig } from "./AppServerConfig";

/**
 * Central application server that provides modular service composition.
 */
export class AppServer {
  private server: FastifyInstance;
  private mcpServer: McpServer | null = null;
  private authManager: ProxyAuthManager | null = null;
  private config: AppServerConfig;

  constructor(
    private docService: IDocumentManagement,
    private pipeline: IPipeline,
    config: AppServerConfig,
  ) {
    this.config = config;
    this.server = Fastify({
      logger: false, // Use our own logger
    });
  }

  /**
   * Validate the server configuration for invalid service combinations.
   */
  private validateConfig(): void {
    // Web interface needs either worker or external worker URL
    if (this.config.enableWebInterface) {
      if (!this.config.enableWorker && !this.config.externalWorkerUrl) {
        throw new Error(
          "Web interface requires either embedded worker (enableWorker: true) or external worker (externalWorkerUrl)",
        );
      }
    }

    // MCP server needs pipeline access (worker or external)
    if (this.config.enableMcpServer) {
      if (!this.config.enableWorker && !this.config.externalWorkerUrl) {
        throw new Error(
          "MCP server requires either embedded worker (enableWorker: true) or external worker (externalWorkerUrl)",
        );
      }
    }

    // Pipeline RPC should be enabled if we have a worker
    if (this.config.enableWorker && !this.config.enableApiServer) {
      logger.warn(
        "Warning: Worker is enabled but API server is disabled. Consider enabling the API for better observability.",
      );
    }
  }

  /**
   * Start the application server with the configured services.
   */
  async start(): Promise<FastifyInstance> {
    this.validateConfig();
    await this.setupServer();

    try {
      const address = await this.server.listen({
        port: this.config.port,
        host: "0.0.0.0",
      });

      this.logStartupInfo(address);
      return this.server;
    } catch (error) {
      logger.error(`❌ Failed to start AppServer: ${error}`);
      await this.server.close();
      throw error;
    }
  }

  /**
   * Stop the application server and cleanup all services.
   */
  async stop(): Promise<void> {
    try {
      // Stop worker service if enabled
      if (this.config.enableWorker) {
        await stopWorkerService(this.pipeline);
      }

      // Cleanup MCP service if enabled
      if (this.mcpServer) {
        await cleanupMcpService(this.mcpServer);
      }

      // Close Fastify server
      await this.server.close();
      logger.info("🛑 AppServer stopped");
    } catch (error) {
      logger.error(`❌ Failed to stop AppServer gracefully: ${error}`);
      throw error;
    }
  }

  /**
   * Setup the server with plugins and conditionally enabled services.
   */
  private async setupServer(): Promise<void> {
    // Initialize authentication if enabled
    if (this.config.auth?.enabled) {
      await this.initializeAuth();
    }

    // Register core Fastify plugins
    await this.server.register(formBody);

    // Add request logging middleware for OAuth debugging
    if (this.config.auth?.enabled) {
      this.server.addHook("onRequest", async (request) => {
        if (
          request.url.includes("/oauth") ||
          request.url.includes("/auth") ||
          request.url.includes("/register")
        ) {
          logger.debug(
            `${request.method} ${request.url} - Headers: ${JSON.stringify(request.headers)}`,
          );
        }
      });
    }

    // Add protected resource metadata endpoint for RFC9728 compliance
    if (this.config.auth?.enabled && this.authManager) {
      await this.setupAuthMetadataEndpoint();
    }

    // Conditionally enable services based on configuration
    if (this.config.enableWebInterface) {
      await this.enableWebInterface();
    }

    if (this.config.enableMcpServer) {
      await this.enableMcpServer();
    }

    if (this.config.enableApiServer) {
      await this.enableTrpcApi();
    }

    if (this.config.enableWorker) {
      await this.enableWorker();
    }

    // Setup static file serving as fallback (must be last)
    if (this.config.enableWebInterface) {
      await this.setupStaticFiles();
    }
  }

  /**
   * Enable web interface service.
   */
  private async enableWebInterface(): Promise<void> {
    await registerWebService(this.server, this.docService, this.pipeline);
    logger.debug("Web interface service enabled");
  }

  /**
   * Enable MCP server service.
   */
  private async enableMcpServer(): Promise<void> {
    this.mcpServer = await registerMcpService(
      this.server,
      this.docService,
      this.pipeline,
      this.config.readOnly,
      this.authManager || undefined,
    );
    logger.debug("MCP server service enabled");
  }

  /**
   * Enable Pipeline RPC (tRPC) service.
   */
  private async enableTrpcApi(): Promise<void> {
    await registerTrpcService(this.server, this.pipeline, this.docService);
    logger.debug("API server (tRPC) enabled");
  }

  /**
   * Enable worker service.
   */
  private async enableWorker(): Promise<void> {
    await registerWorkerService(this.pipeline);
    logger.debug("Worker service enabled");
  }

  /**
   * Setup static file serving with root prefix as fallback.
   */
  private async setupStaticFiles(): Promise<void> {
    await this.server.register(fastifyStatic, {
      root: path.join(getProjectRoot(), "public"),
      prefix: "/",
      index: false,
    });
  }

  /**
   * Initialize OAuth2/OIDC authentication manager.
   */
  private async initializeAuth(): Promise<void> {
    if (!this.config.auth) {
      return;
    }

    this.authManager = new ProxyAuthManager(this.config.auth);
    await this.authManager.initialize();
    logger.debug("Proxy auth manager initialized");
  }

  /**
   * Setup OAuth2 endpoints using ProxyAuthManager.
   */
  private async setupAuthMetadataEndpoint(): Promise<void> {
    if (!this.authManager) {
      return;
    }

    // ProxyAuthManager handles all OAuth2 endpoints automatically
    const baseUrl = new URL(`http://localhost:${this.config.port}`);
    this.authManager.registerRoutes(this.server, baseUrl);

    logger.debug("OAuth2 proxy endpoints registered");
  }

  /**
   * Log startup information showing which services are enabled.
   */
  private logStartupInfo(address: string): void {
    logger.info(`🚀 AppServer available at ${address}`);

    const enabledServices: string[] = [];

    if (this.config.enableWebInterface) {
      enabledServices.push(`Web interface: ${address}`);
    }

    if (this.config.enableMcpServer) {
      enabledServices.push(`MCP endpoints: ${address}/mcp, ${address}/sse`);
    }

    if (this.config.enableApiServer) {
      enabledServices.push(`API: ${address}/api`);
    }

    if (this.config.enableWorker) {
      enabledServices.push("Embedded worker: enabled");
    } else if (this.config.externalWorkerUrl) {
      enabledServices.push(`External worker: ${this.config.externalWorkerUrl}`);
    }

    for (const service of enabledServices) {
      logger.info(`   • ${service}`);
    }
  }
}
