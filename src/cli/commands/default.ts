/**
 * Default command - Starts unified server when no subcommand is specified.
 */

import type { Command } from "commander";
import { startAppServer } from "../../app";
import { startStdioServer } from "../../mcp/startStdioServer";
import { initializeTools } from "../../mcp/tools";
import type { PipelineOptions } from "../../pipeline";
import { logger } from "../../utils/logger";
import {
  CLI_DEFAULTS,
  createAppServerConfig,
  ensurePlaywrightBrowsersInstalled,
  initializeDocumentService,
  initializePipeline,
  resolveProtocol,
  setupLogging,
  validatePort,
} from "../utils";

export function createDefaultAction(program: Command): Command {
  return program
    .option(
      "--protocol <type>",
      "Protocol for MCP server: 'auto' (default), 'stdio', or 'http'",
      "auto",
    )
    .option("--port <number>", "Port for the server", CLI_DEFAULTS.HTTP_PORT.toString())
    .option("--resume", "Resume interrupted jobs on startup", false)
    .action(
      async (
        options: {
          protocol: string;
          port: string;
          resume: boolean;
        },
        command,
      ) => {
        const globalOptions = command.opts();

        // Resolve protocol and validate flags
        const resolvedProtocol = resolveProtocol(options.protocol);

        // Setup logging
        setupLogging(globalOptions, resolvedProtocol);
        logger.debug("No subcommand specified, starting unified server by default...");
        const port = validatePort(options.port);

        // Ensure browsers are installed
        ensurePlaywrightBrowsersInstalled();

        const docService = await initializeDocumentService();
        const pipelineOptions: PipelineOptions = {
          recoverJobs: options.resume || false, // Use --resume flag for job recovery
          concurrency: 3,
        };
        const pipeline = await initializePipeline(docService, pipelineOptions);

        if (resolvedProtocol === "stdio") {
          // Direct stdio mode - bypass AppServer entirely
          logger.debug(`🔍 Auto-detected stdio protocol (no TTY)`);

          await pipeline.start(); // Start pipeline for stdio mode
          const mcpTools = await initializeTools(docService, pipeline);
          await startStdioServer(mcpTools);

          await new Promise(() => {}); // Keep running forever
        } else {
          // HTTP mode - use AppServer
          logger.debug(`🔍 Auto-detected http protocol (TTY available)`);

          // Configure services based on resolved protocol
          const config = createAppServerConfig({
            enableWebInterface: true, // Enable web interface in http mode
            enableMcpServer: true, // Always enable MCP server
            enablePipelineApi: true, // Enable pipeline API in http mode
            enableWorker: true, // Always enable in-process worker for unified server
            port,
          });

          await startAppServer(docService, pipeline, config);

          await new Promise(() => {}); // Keep running forever
        }
      },
    );
}
