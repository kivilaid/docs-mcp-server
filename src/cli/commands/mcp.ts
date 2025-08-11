/**
 * MCP command - Starts MCP server only.
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
  initializeDocumentService,
  initializePipeline,
  resolveProtocol,
  setupLogging,
  validatePort,
} from "../utils";

export function createMcpCommand(program: Command): Command {
  return program
    .command("mcp")
    .description("Start MCP server only")
    .option(
      "--protocol <type>",
      "Protocol for MCP server: 'auto' (default), 'stdio', or 'http'",
      CLI_DEFAULTS.PROTOCOL,
    )
    .option(
      "--port <number>",
      "Port for the MCP server",
      CLI_DEFAULTS.HTTP_PORT.toString(),
    )
    .option(
      "--server-url <url>",
      "URL of external pipeline worker RPC (e.g., http://localhost:6280/trpc)",
    )
    .action(
      async (
        cmdOptions: {
          protocol: string;
          port: string;
          serverUrl?: string;
        },
        command,
      ) => {
        const globalOptions = command.parent?.opts() || {};
        const port = validatePort(cmdOptions.port);
        const serverUrl = cmdOptions.serverUrl;

        // Resolve protocol using same logic as default action
        const resolvedProtocol = resolveProtocol(cmdOptions.protocol);
        setupLogging(globalOptions, resolvedProtocol);

        try {
          const docService = await initializeDocumentService(serverUrl);
          const pipelineOptions: PipelineOptions = {
            recoverJobs: false, // MCP command doesn't support job recovery
            serverUrl,
            concurrency: 3,
          };
          const pipeline = await initializePipeline(docService, pipelineOptions);

          if (resolvedProtocol === "stdio") {
            // Direct stdio mode - bypass AppServer entirely
            logger.debug(`🔍 Auto-detected stdio protocol (no TTY)`);
            logger.info("🚀 Starting MCP server (stdio mode)");

            await pipeline.start(); // Start pipeline for stdio mode
            const mcpTools = await initializeTools(docService, pipeline);
            await startStdioServer(mcpTools);

            await new Promise(() => {}); // Keep running forever
          } else {
            // HTTP mode - use AppServer
            logger.debug(`🔍 Auto-detected http protocol (TTY available)`);
            logger.info("🚀 Starting MCP server (http mode)");

            // Configure MCP-only server
            const config = createAppServerConfig({
              enableWebInterface: false, // Never enable web interface in mcp command
              enableMcpServer: true,
              enableApiServer: false, // Never enable API in mcp command
              enableWorker: !serverUrl,
              port,
              externalWorkerUrl: serverUrl,
            });

            await startAppServer(docService, pipeline, config);
            await new Promise(() => {}); // Keep running forever
          }
        } catch (error) {
          logger.error(`❌ Failed to start MCP server: ${error}`);
          process.exit(1);
        }
      },
    );
}
