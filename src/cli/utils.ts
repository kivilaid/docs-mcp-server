/**
 * Shared CLI utilities and helper functions.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import type { AppServerConfig } from "../app";
import type { IPipeline, PipelineOptions } from "../pipeline";
import { PipelineFactory } from "../pipeline";
import { DocumentManagementService } from "../store/DocumentManagementService";
import {
  DEFAULT_HTTP_PORT,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_PROTOCOL,
  DEFAULT_WEB_PORT,
} from "../utils/config";
import { LogLevel, logger, setLogLevel } from "../utils/logger";
import { getProjectRoot } from "../utils/paths";
import type { GlobalOptions } from "./types";

/**
 * Ensures that the Playwright browsers are installed, unless a system Chromium path is set.
 */
export function ensurePlaywrightBrowsersInstalled(): void {
  // If PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is set, skip install
  const chromiumEnvPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (chromiumEnvPath && existsSync(chromiumEnvPath)) {
    logger.debug(
      `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is set to '${chromiumEnvPath}', skipping Playwright browser install.`,
    );
    return;
  }
  try {
    // Dynamically require Playwright and check for Chromium browser
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const chromiumPath = chromium.executablePath();
    if (!chromiumPath || !existsSync(chromiumPath)) {
      throw new Error("Playwright Chromium browser not found");
    }
  } catch (_err) {
    // Not installed or not found, attempt to install
    logger.debug(
      "Playwright browsers not found. Installing Chromium browser for dynamic scraping (this may take a minute)...",
    );
    try {
      logger.debug("Installing Playwright Chromium browser...");
      execSync("npm exec -y playwright install --no-shell --with-deps chromium", {
        stdio: "ignore", // Suppress output
        cwd: getProjectRoot(),
      });
    } catch (_installErr) {
      console.error(
        "❌ Failed to install Playwright browsers automatically. Please run:\n  npx playwright install --no-shell --with-deps chromium\nand try again.",
      );
      process.exit(1);
    }
  }
}

/**
 * Resolves the protocol based on auto-detection or explicit specification.
 * Auto-detection uses TTY status to determine appropriate protocol.
 */
export function resolveProtocol(protocol: string): "stdio" | "http" {
  if (protocol === "auto") {
    // VS Code and CI/CD typically run without TTY
    if (!process.stdin.isTTY && !process.stdout.isTTY) {
      return "stdio";
    }
    return "http";
  }

  // Explicit protocol specification
  if (protocol === "stdio" || protocol === "http") {
    return protocol;
  }

  throw new Error(`Invalid protocol: ${protocol}. Must be 'auto', 'stdio', or 'http'`);
}

/**
 * Validates that --resume flag is only used with in-process workers.
 */
export function validateResumeFlag(resume: boolean, serverUrl?: string): void {
  if (resume && serverUrl) {
    throw new Error(
      "--resume flag is incompatible with --server-url. " +
        "External workers handle their own job recovery.",
    );
  }
}

/**
 * Formats output for CLI commands
 */
export const formatOutput = (data: unknown): string => JSON.stringify(data, null, 2);

/**
 * Sets up logging based on global options
 */
export function setupLogging(options: GlobalOptions, protocol?: "stdio" | "http"): void {
  if (options.silent) {
    setLogLevel(LogLevel.ERROR);
  } else if (options.verbose) {
    setLogLevel(LogLevel.DEBUG);
  }

  // Suppress logging in stdio mode (before any logger calls)
  if (protocol === "stdio") {
    setLogLevel(LogLevel.ERROR);
  }
}

/**
 * Validates and parses port number
 */
export function validatePort(portString: string): number {
  const port = Number.parseInt(portString, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error("❌ Invalid port number");
  }
  return port;
}

/**
 * Initializes DocumentManagementService for CLI commands
 */
export async function initializeDocumentService(): Promise<DocumentManagementService> {
  const docService = new DocumentManagementService();
  await docService.initialize();
  return docService;
}

/**
 * Initializes PipelineManager for CLI commands
 */
export async function initializePipeline(
  docService: DocumentManagementService,
  options: PipelineOptions = {},
): Promise<IPipeline> {
  logger.debug(`Initializing PipelineManager with options: ${JSON.stringify(options)}`);
  const manager = await PipelineFactory.createPipeline(docService, options);

  // Configure progress callbacks for real-time updates
  manager.setCallbacks({
    onJobProgress: async (job, progress) => {
      logger.debug(
        `📊 Job ${job.id} progress: ${progress.pagesScraped}/${progress.totalPages} pages`,
      );
      // Use manager as single source of truth for progress updates
      await manager.updateJobProgress(job, progress);
    },
    onJobStatusChange: async (job) => {
      logger.debug(`🔄 Job ${job.id} status changed to: ${job.status}`);
    },
    onJobError: async (job, error, document) => {
      logger.warn(
        `⚠️ Job ${job.id} error ${document ? `on document ${document.metadata.url}` : ""}: ${error.message}`,
      );
    },
  });

  return manager;
}

/**
 * Creates AppServerConfig based on service requirements
 */
export function createAppServerConfig(options: {
  enableWebInterface?: boolean;
  enableMcpServer?: boolean;
  enablePipelineApi?: boolean;
  enableWorker?: boolean;
  port: number;
  externalWorkerUrl?: string;
}): AppServerConfig {
  return {
    enableWebInterface: options.enableWebInterface ?? false,
    enableMcpServer: options.enableMcpServer ?? true,
    enablePipelineApi: options.enablePipelineApi ?? false,
    enableWorker: options.enableWorker ?? true,
    port: options.port,
    externalWorkerUrl: options.externalWorkerUrl,
  };
}

/**
 * Parses custom headers from CLI options
 */
export function parseHeaders(headerOptions: string[]): Record<string, string> {
  const headers: Record<string, string> = {};

  if (Array.isArray(headerOptions)) {
    for (const entry of headerOptions) {
      const idx = entry.indexOf(":");
      if (idx > 0) {
        const name = entry.slice(0, idx).trim();
        const value = entry.slice(idx + 1).trim();
        if (name) headers[name] = value;
      }
    }
  }

  return headers;
}

/**
 * Default configuration values
 */
export const CLI_DEFAULTS = {
  PROTOCOL: DEFAULT_PROTOCOL,
  HTTP_PORT: DEFAULT_HTTP_PORT,
  WEB_PORT: DEFAULT_WEB_PORT,
  MAX_CONCURRENCY: DEFAULT_MAX_CONCURRENCY,
} as const;
