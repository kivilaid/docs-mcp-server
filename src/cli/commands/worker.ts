/**
 * Worker command - Starts external pipeline worker (HTTP API).
 */

import type { Command } from "commander";
import { startAppServer } from "../../app";
import type { PipelineOptions } from "../../pipeline";
import { logger } from "../../utils/logger";
import {
  CLI_DEFAULTS,
  createAppServerConfig,
  ensurePlaywrightBrowsersInstalled,
  initializeDocumentService,
  initializePipeline,
  setupLogging,
  validatePort,
} from "../utils";

export function createWorkerCommand(program: Command): Command {
  return program
    .command("worker")
    .description("Start external pipeline worker (HTTP API)")
    .option("--port <number>", "Port for worker API", "8080")
    .option("--resume", "Resume interrupted jobs on startup", true)
    .action(async (cmdOptions: { port: string; resume: boolean }, command) => {
      const globalOptions = command.parent?.opts() || {};
      const port = validatePort(cmdOptions.port);

      setupLogging(globalOptions);

      try {
        logger.info(`🚀 Starting external pipeline worker on port ${port}`);

        // Ensure browsers are installed for scraping
        ensurePlaywrightBrowsersInstalled();

        // Initialize services
        const docService = await initializeDocumentService();
        const pipelineOptions: PipelineOptions = {
          recoverJobs: cmdOptions.resume, // Use the resume option
          concurrency: CLI_DEFAULTS.MAX_CONCURRENCY,
        };
        const pipeline = await initializePipeline(docService, pipelineOptions);

        // Configure worker-only server
        const config = createAppServerConfig({
          enableWebInterface: false,
          enableMcpServer: false,
          enablePipelineApi: true,
          enableWorker: true,
          port,
        });

        logger.info(`🚀 Starting external pipeline worker with HTTP API`);
        await startAppServer(docService, pipeline, config);

        await new Promise(() => {}); // Keep running forever
      } catch (error) {
        logger.error(`❌ Failed to start external pipeline worker: ${error}`);
        process.exit(1);
      }
    });
}
