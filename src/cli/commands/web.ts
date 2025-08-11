/**
 * Web command - Starts web interface only.
 */

import type { Command } from "commander";
import { startAppServer } from "../../app";
import type { PipelineOptions } from "../../pipeline";
import { logger } from "../../utils/logger";
import {
  CLI_DEFAULTS,
  createAppServerConfig,
  initializeDocumentService,
  initializePipeline,
  setupLogging,
  validatePort,
} from "../utils";

export function createWebCommand(program: Command): Command {
  return program
    .command("web")
    .description("Start web interface only")
    .option(
      "--port <number>",
      "Port for the web interface",
      CLI_DEFAULTS.WEB_PORT.toString(),
    )
    .option(
      "--server-url <url>",
      "URL of external pipeline worker RPC (e.g., http://localhost:6280/api)",
    )
    .action(
      async (
        cmdOptions: {
          port: string;
          serverUrl?: string;
        },
        command,
      ) => {
        const globalOptions = command.parent?.opts() || {};
        const port = validatePort(cmdOptions.port);
        const serverUrl = cmdOptions.serverUrl;

        setupLogging(globalOptions);

        try {
          const docService = await initializeDocumentService(serverUrl);
          const pipelineOptions: PipelineOptions = {
            recoverJobs: false, // Web command doesn't support job recovery
            serverUrl,
            concurrency: 3,
          };
          const pipeline = await initializePipeline(docService, pipelineOptions);

          // Configure web-only server
          const config = createAppServerConfig({
            enableWebInterface: true,
            enableMcpServer: false,
            enableApiServer: false,
            enableWorker: !serverUrl,
            port,
            externalWorkerUrl: serverUrl,
          });

          logger.info(
            `🚀 Starting web interface${serverUrl ? ` connecting to worker at ${serverUrl}` : ""}`,
          );
          await startAppServer(docService, pipeline, config);

          await new Promise(() => {}); // Keep running forever
        } catch (error) {
          logger.error(`❌ Failed to start web interface: ${error}`);
          process.exit(1);
        }
      },
    );
}
