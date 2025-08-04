/**
 * Central application server that can be configured to run different combinations of services.
 * This replaces the separate server implementations with a single, modular approach.
 */

import path from "node:path";
import formBody from "@fastify/formbody";
import fastifyStatic from "@fastify/static";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Fastify, { type FastifyInstance } from "fastify";
import type { IPipeline } from "../pipeline/interfaces";
import { cleanupMcpService, registerMcpService } from "../services/mcpService";
import { registerPipelineApiService } from "../services/pipelineApiService";
import { registerWebService } from "../services/webService";
import { registerWorkerService, stopWorkerService } from "../services/workerService";
import type { DocumentManagementService } from "../store/DocumentManagementService";
import { logger } from "../utils/logger";
import { getProjectRoot } from "../utils/paths";
import type { AppServerConfig } from "./AppServerConfig";

/**
 * Central application server that provides modular service composition.
 */
export class AppServer {
  private server: FastifyInstance;
  private mcpServer: McpServer | null = null;
  private config: AppServerConfig;

  constructor(
    private docService: DocumentManagementService,
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

    // Pipeline API should be enabled if we have a worker
    if (this.config.enableWorker && !this.config.enablePipelineApi) {
      logger.warn(
        "Warning: Worker is enabled but Pipeline API is disabled. Consider enabling Pipeline API for better observability.",
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
    // Register core Fastify plugins
    await this.server.register(formBody);

    // Conditionally enable services based on configuration
    if (this.config.enableWebInterface) {
      await this.enableWebInterface();
    }

    if (this.config.enableMcpServer) {
      await this.enableMcpServer();
    }

    if (this.config.enablePipelineApi) {
      await this.enablePipelineApi();
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
    );
    logger.debug("MCP server service enabled");
  }

  /**
   * Enable Pipeline API service.
   */
  private async enablePipelineApi(): Promise<void> {
    await registerPipelineApiService(this.server, this.pipeline);
    logger.debug("Pipeline API service enabled");
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
   * Log startup information showing which services are enabled.
   */
  private logStartupInfo(address: string): void {
    logger.info(`🚀 AppServer available at ${address}`);

    const enabledServices: string[] = [];

    if (this.config.enableWebInterface) {
      enabledServices.push(`Web interface: ${address}`);
    }

    if (this.config.enableMcpServer) {
      enabledServices.push(`MCP endpoint: ${address}/sse`);
    }

    if (this.config.enablePipelineApi) {
      enabledServices.push(`Pipeline API: ${address}/api/`);
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
