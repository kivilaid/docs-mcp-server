#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import "dotenv/config";
import { Command } from "commander";
import type { FastifyInstance } from "fastify";
import { chromium } from "playwright";
import packageJson from "../package.json";
import { startServer as startMcpServer, stopServer as stopMcpServer } from "./mcp";
import { PipelineManager } from "./pipeline/PipelineManager";
import { FileFetcher, HttpFetcher } from "./scraper/fetcher";
import { ScrapeMode } from "./scraper/types";
import { DocumentManagementService } from "./store/DocumentManagementService";
import {
  FetchUrlTool,
  FindVersionTool,
  ListLibrariesTool,
  ScrapeTool,
  SearchTool,
} from "./tools";
import {
  DEFAULT_HTTP_PORT,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_PAGES,
  DEFAULT_PROTOCOL,
  DEFAULT_WEB_PORT,
} from "./utils/config";
import { LogLevel, logger, setLogLevel } from "./utils/logger";
import { getProjectRoot } from "./utils/paths";
import { startWebServer, stopWebServer } from "./web/web";

/**
 * Ensures that the Playwright browsers are installed, unless a system Chromium path is set.
 */
function ensurePlaywrightBrowsersInstalled(): void {
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

ensurePlaywrightBrowsersInstalled();

const formatOutput = (data: unknown) => JSON.stringify(data, null, 2);

// Module-level variables for server instances and shutdown state
let mcpServerRunning = false;
let webServerInstance: FastifyInstance | null = null;
let activeDocService: DocumentManagementService | null = null;
let activePipelineManager: PipelineManager | null = null;

let isShuttingDown = false; // Use a module-level boolean

const sigintHandler = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.debug("Received SIGINT. Shutting down gracefully...");
  try {
    if (webServerInstance) {
      logger.debug("SIGINT: Stopping web server...");
      await stopWebServer(webServerInstance);
      webServerInstance = null;
      logger.debug("SIGINT: Web server stopped.");
    }
    if (mcpServerRunning) {
      logger.debug("SIGINT: Stopping MCP server instance...");
      await stopMcpServer(); // This now only stops the McpServer object
      mcpServerRunning = false;
      logger.debug("SIGINT: MCP server instance stopped.");
    }

    // Shutdown active services
    logger.debug("SIGINT: Shutting down active services...");
    if (activePipelineManager) {
      await activePipelineManager.stop();
      activePipelineManager = null;
      logger.debug("SIGINT: PipelineManager stopped.");
    }
    if (activeDocService) {
      await activeDocService.shutdown();
      activeDocService = null;
      logger.debug("SIGINT: DocumentManagementService shut down.");
    }
  } catch (e) {
    logger.error(`❌ Error during SIGINT shutdown: ${e}`);
  } finally {
    logger.debug("SIGINT: Shutdown process completed.");
    process.exit(0);
  }
};

async function main() {
  let commandExecuted = false;
  // The module-level 'isShuttingDown' is initialized to false.
  // HMR handler will reset it for new module instances if HMR is active.
  // For a standard run, it's reset here.
  isShuttingDown = false;

  // Ensure only one SIGINT handler is active for this process instance,
  // especially important across HMR cycles if dispose isn't perfect.
  process.removeListener("SIGINT", sigintHandler);
  process.on("SIGINT", sigintHandler);

  // Helper functions for service initialization (for long-running modes)
  async function ensureDocServiceInitialized(): Promise<DocumentManagementService> {
    if (!activeDocService) {
      logger.debug("Initializing DocumentManagementService for server mode...");
      const service = new DocumentManagementService();
      await service.initialize();
      activeDocService = service;
      logger.debug("DocumentManagementService initialized for server mode.");
    }
    return activeDocService;
  }

  async function ensurePipelineManagerInitialized(): Promise<PipelineManager> {
    const ds = await ensureDocServiceInitialized(); // Depends on DocService
    if (!activePipelineManager) {
      logger.debug("Initializing PipelineManager for server mode...");
      const manager = new PipelineManager(ds);

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

      await manager.start();
      activePipelineManager = manager;
      logger.debug("PipelineManager initialized for server mode.");
    }
    return activePipelineManager;
  }

  try {
    const program = new Command();

    program
      .name("docs-mcp-server")
      .description("Unified CLI, MCP Server, and Web Interface for Docs MCP Server.")
      .version(packageJson.version)
      .option("--verbose", "Enable verbose (debug) logging", false)
      .option("--silent", "Disable all logging except errors", false)
      .enablePositionalOptions()
      .showHelpAfterError(true)
      .option(
        "--protocol <type>",
        "Protocol for MCP server (stdio or http)",
        DEFAULT_PROTOCOL,
      )
      .option(
        "--port <number>",
        "Port for MCP server (if http protocol)",
        DEFAULT_HTTP_PORT.toString(),
      );

    program.hook("preAction", (thisCommand, actionCommand) => {
      const globalOptions = thisCommand.opts();
      if (globalOptions.silent) setLogLevel(LogLevel.ERROR);
      else if (globalOptions.verbose) setLogLevel(LogLevel.DEBUG);
      if (actionCommand.name() !== program.name()) commandExecuted = true;
    });

    program
      .command("web")
      .description("Start the web interface")
      .option(
        "--port <number>",
        "Port for the web interface",
        DEFAULT_WEB_PORT.toString(),
      )
      .action(async (cmdOptions) => {
        commandExecuted = true;
        const docService = await ensureDocServiceInitialized();
        const pipelineManager = await ensurePipelineManagerInitialized();
        const port = Number.parseInt(cmdOptions.port, 10);
        if (Number.isNaN(port)) {
          console.error("Web port must be a number.");
          process.exit(1);
        }
        webServerInstance = await startWebServer(port, docService, pipelineManager);
        await new Promise(() => {}); // Keep alive
      });

    // --- Scrape Command ---
    program
      .command("scrape <library> <url>")
      .description(
        "Scrape and index documentation from a URL or local folder.\n\n" +
          "To scrape local files or folders, use a file:// URL.\n" +
          "Examples:\n" +
          "  scrape mylib https://react.dev/reference/react\n" +
          "  scrape mylib file:///Users/me/docs/index.html\n" +
          "  scrape mylib file:///Users/me/docs/my-library\n" +
          "\nNote: For local files/folders, you must use the file:// prefix. If running in Docker, mount the folder and use the container path. See README for details.",
      )
      .option("-v, --version <string>", "Version of the library (optional)")
      .option(
        "-p, --max-pages <number>",
        "Maximum pages to scrape",
        DEFAULT_MAX_PAGES.toString(),
      )
      .option(
        "-d, --max-depth <number>",
        "Maximum navigation depth",
        DEFAULT_MAX_DEPTH.toString(),
      )
      .option(
        "-c, --max-concurrency <number>",
        "Maximum concurrent page requests",
        DEFAULT_MAX_CONCURRENCY.toString(),
      )
      .option("--ignore-errors", "Ignore errors during scraping", true)
      .option(
        "--scope <scope>",
        "Crawling boundary: 'subpages' (default), 'hostname', or 'domain'",
        (value) => {
          const validScopes = ["subpages", "hostname", "domain"];
          if (!validScopes.includes(value)) {
            console.warn(`Warning: Invalid scope '${value}'. Using default 'subpages'.`);
            return "subpages";
          }
          return value;
        },
        "subpages",
      )
      .option(
        "--no-follow-redirects",
        "Disable following HTTP redirects (default: follow redirects)",
      )
      .option(
        "--scrape-mode <mode>",
        `HTML processing strategy: '${ScrapeMode.Fetch}', '${ScrapeMode.Playwright}', '${ScrapeMode.Auto}' (default)`,
        (value: string): ScrapeMode => {
          const validModes = Object.values(ScrapeMode);
          if (!validModes.includes(value as ScrapeMode)) {
            console.warn(
              `Warning: Invalid scrape mode '${value}'. Using default '${ScrapeMode.Auto}'.`,
            );
            return ScrapeMode.Auto;
          }
          return value as ScrapeMode;
        },
        ScrapeMode.Auto,
      )
      .option(
        "--include-pattern <pattern>",
        "Glob or regex pattern for URLs to include (can be specified multiple times). Regex patterns must be wrapped in slashes, e.g. /pattern/.",
        (val: string, prev: string[] = []) => prev.concat([val]),
        [] as string[],
      )
      .option(
        "--exclude-pattern <pattern>",
        "Glob or regex pattern for URLs to exclude (can be specified multiple times, takes precedence over include). Regex patterns must be wrapped in slashes, e.g. /pattern/.",
        (val: string, prev: string[] = []) => prev.concat([val]),
        [] as string[],
      )
      .option(
        "--header <name:value>",
        "Custom HTTP header to send with each request (can be specified multiple times)",
        (val: string, prev: string[] = []) => prev.concat([val]),
        [] as string[],
      )
      .action(async (library, url, options) => {
        commandExecuted = true; // Ensure this is set for CLI commands
        const docService = new DocumentManagementService();
        let pipelineManager: PipelineManager | null = null;
        try {
          await docService.initialize();
          pipelineManager = new PipelineManager(docService);
          await pipelineManager.start();
          const scrapeTool = new ScrapeTool(docService, pipelineManager);

          // Parse headers from CLI options
          const headers: Record<string, string> = {};
          if (Array.isArray(options.header)) {
            for (const entry of options.header) {
              const idx = entry.indexOf(":");
              if (idx > 0) {
                const name = entry.slice(0, idx).trim();
                const value = entry.slice(idx + 1).trim();
                if (name) headers[name] = value;
              }
            }
          }

          const result = await scrapeTool.execute({
            url,
            library,
            version: options.version,
            options: {
              maxPages: Number.parseInt(options.maxPages),
              maxDepth: Number.parseInt(options.maxDepth),
              maxConcurrency: Number.parseInt(options.maxConcurrency),
              ignoreErrors: options.ignoreErrors,
              scope: options.scope,
              followRedirects: options.followRedirects,
              scrapeMode: options.scrapeMode,
              includePatterns:
                Array.isArray(options.includePattern) && options.includePattern.length > 0
                  ? options.includePattern
                  : undefined,
              excludePatterns:
                Array.isArray(options.excludePattern) && options.excludePattern.length > 0
                  ? options.excludePattern
                  : undefined,
              headers: Object.keys(headers).length > 0 ? headers : undefined,
            },
          });
          if ("pagesScraped" in result)
            console.log(`✅ Successfully scraped ${result.pagesScraped} pages`);
          else console.log(`🚀 Scraping job started with ID: ${result.jobId}`);
        } finally {
          if (pipelineManager) await pipelineManager.stop();
          await docService.shutdown();
        }
      });

    // --- Search Command ---
    program
      .command("search <library> <query>")
      .description(
        "Search documents in a library. Version matching examples:\n" +
          "  - search react --version 18.0.0 'hooks' -> matches docs for React 18.0.0 or earlier versions\n" +
          "  - search react --version 18.0.0 'hooks' --exact-match -> only matches React 18.0.0\n" +
          "  - search typescript --version 5.x 'types' -> matches any TypeScript 5.x.x version\n" +
          "  - search typescript --version 5.2.x 'types' -> matches any TypeScript 5.2.x version",
      )
      .option(
        "-v, --version <string>",
        "Version of the library (optional, supports ranges)",
      )
      .option("-l, --limit <number>", "Maximum number of results", "5")
      .option("-e, --exact-match", "Only use exact version match (default: false)", false)
      .action(async (library, query, options) => {
        commandExecuted = true; // Ensure this is set
        const docService = new DocumentManagementService();
        try {
          await docService.initialize();
          const searchTool = new SearchTool(docService);
          const result = await searchTool.execute({
            library,
            version: options.version,
            query,
            limit: Number.parseInt(options.limit),
            exactMatch: options.exactMatch,
          });
          console.log(formatOutput(result.results));
        } finally {
          await docService.shutdown();
        }
      });

    // --- List Command ---
    program
      .command("list")
      .description("List all available libraries and their versions")
      .action(async () => {
        commandExecuted = true; // Ensure this is set
        const docService = new DocumentManagementService();
        try {
          await docService.initialize();
          const listLibrariesTool = new ListLibrariesTool(docService);
          const result = await listLibrariesTool.execute();
          console.log(formatOutput(result.libraries));
        } finally {
          await docService.shutdown();
        }
      });

    // --- Find Version Command ---
    program
      .command("find-version <library>")
      .description("Find the best matching version for a library")
      .option("-v, --version <string>", "Pattern to match (optional, supports ranges)")
      .action(async (library, options) => {
        commandExecuted = true; // Ensure this is set
        const docService = new DocumentManagementService();
        try {
          await docService.initialize();
          const findVersionTool = new FindVersionTool(docService);
          const versionInfo = await findVersionTool.execute({
            library,
            targetVersion: options.version,
          });
          if (!versionInfo) throw new Error("Failed to get version information");
          console.log(versionInfo);
        } finally {
          await docService.shutdown();
        }
      });

    // --- Remove Command ---
    program
      .command("remove <library>")
      .description("Remove documents for a specific library and version")
      .option(
        "-v, --version <string>",
        "Version to remove (optional, removes unversioned if omitted)",
      )
      .action(async (library, options) => {
        commandExecuted = true; // Ensure this is set
        const docService = new DocumentManagementService();
        const { version } = options;
        try {
          await docService.initialize();
          // No specific tool needed, direct service call
          await docService.removeAllDocuments(library, version);
          console.log(
            `✅ Successfully removed documents for ${library}${version ? `@${version}` : " (unversioned)"}.`,
          );
        } catch (error) {
          console.error(
            `❌ Failed to remove documents for ${library}${version ? `@${version}` : " (unversioned)"}:`,
            error instanceof Error ? error.message : String(error),
          );
          // Re-throw to allow main error handler to catch if necessary,
          // but ensure shutdown still happens in finally.
          throw error;
        } finally {
          await docService.shutdown();
        }
      });

    // --- Fetch URL Command ---
    program
      .command("fetch-url <url>")
      .description("Fetch a URL and convert its content to Markdown")
      .option(
        "--no-follow-redirects",
        "Disable following HTTP redirects (default: follow redirects)",
      )
      .option(
        "--scrape-mode <mode>",
        `HTML processing strategy: '${ScrapeMode.Fetch}', '${ScrapeMode.Playwright}', '${ScrapeMode.Auto}' (default)`,
        (value: string): ScrapeMode => {
          const validModes = Object.values(ScrapeMode);
          if (!validModes.includes(value as ScrapeMode)) {
            console.warn(
              `Warning: Invalid scrape mode '${value}'. Using default '${ScrapeMode.Auto}'.`,
            );
            return ScrapeMode.Auto;
          }
          return value as ScrapeMode;
        },
        ScrapeMode.Auto,
      )
      .option(
        "--header <name:value>",
        "Custom HTTP header to send with the request (can be specified multiple times)",
        (val: string, prev: string[] = []) => prev.concat([val]),
        [] as string[],
      )
      .action(async (url, options) => {
        commandExecuted = true; // Ensure this is set
        // Parse headers from CLI options
        const headers: Record<string, string> = {};
        if (Array.isArray(options.header)) {
          for (const entry of options.header) {
            const idx = entry.indexOf(":");
            if (idx > 0) {
              const name = entry.slice(0, idx).trim();
              const value = entry.slice(idx + 1).trim();
              if (name) headers[name] = value;
            }
          }
        }
        // FetchUrlTool does not require DocumentManagementService or PipelineManager
        const fetchUrlTool = new FetchUrlTool(new HttpFetcher(), new FileFetcher());
        const content = await fetchUrlTool.execute({
          url,
          followRedirects: options.followRedirects,
          scrapeMode: options.scrapeMode,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        });
        console.log(content);
      });

    program.action(async (options) => {
      if (!commandExecuted) {
        logger.debug("No subcommand specified, starting MCP server by default...");
        const docService = await ensureDocServiceInitialized();
        const pipelineManager = await ensurePipelineManagerInitialized();
        const protocol = options.protocol as "stdio" | "http";
        const port = Number.parseInt(options.port, 10);
        if (protocol !== "stdio" && protocol !== "http") {
          console.error('Invalid protocol specified. Use "stdio" or "http".');
          process.exit(1);
        }
        if (protocol === "http" && Number.isNaN(port)) {
          console.error("Port must be a number when using http protocol.");
          process.exit(1);
        }
        mcpServerRunning = true;
        // Pass docService and pipelineManager to the startServer from src/mcp/index.ts
        await startMcpServer(
          protocol,
          docService,
          pipelineManager,
          protocol === "http" ? port : undefined,
        );
        await new Promise(() => {});
      }
    });

    await program.parseAsync(process.argv);
  } catch (error) {
    logger.error(`❌ Error in main: ${error}`);
    if (!isShuttingDown) {
      isShuttingDown = true;
      if (webServerInstance) await stopWebServer(webServerInstance);
      if (mcpServerRunning) await stopMcpServer();
      // For other errors, attempt to shutdown active global services if they exist
      else {
        if (activePipelineManager) {
          await activePipelineManager.stop();
          activePipelineManager = null;
        }
        if (activeDocService) {
          await activeDocService.shutdown();
          activeDocService = null;
        }
      }
    }
    process.exit(1);
  }

  // This block handles cleanup for CLI commands that completed successfully
  // and were not long-running servers.
  // Since short-lived commands now manage their own service shutdown,
  // this block might not need to do anything with activeDocService/activePipelineManager,
  // as those are intended for server modes.
  if (commandExecuted && !webServerInstance && !mcpServerRunning) {
    if (!isShuttingDown) {
      // No active server mode services to shut down here,
      // as CLI commands handle their own.
      logger.debug(
        "CLI command executed. No global services to shut down from this path.",
      );
    }
  }
}

main().catch((error) => {
  if (!isShuttingDown) {
    isShuttingDown = true; // Mark as shutting down
    logger.error(`🔥 Fatal error in main execution: ${error}`);
    // Attempt to shut down active global services
    const shutdownPromises = [];
    if (activePipelineManager) {
      shutdownPromises.push(
        activePipelineManager.stop().then(() => {
          activePipelineManager = null;
        }),
      );
    }
    if (activeDocService) {
      shutdownPromises.push(
        activeDocService.shutdown().then(() => {
          activeDocService = null;
        }),
      );
    }
    Promise.allSettled(shutdownPromises).catch((err) =>
      logger.error(`❌ Error during fatal shutdown cleanup: ${err}`),
    );
  }
  process.exit(1); // Ensure exit on fatal error
});

// Handle HMR for vite-node --watch
if (import.meta.hot) {
  import.meta.hot.on("vite:beforeFullReload", async () => {
    logger.info("🔥 Hot reload detected");
    process.removeListener("SIGINT", sigintHandler); // Remove for this outgoing instance

    // Set shutting down flag for HMR context
    const wasAlreadyShuttingDown = isShuttingDown; // Capture current state
    isShuttingDown = true; // Mark as shutting down for HMR cleanup

    try {
      if (webServerInstance) {
        logger.debug("Shutting down web server...");
        await stopWebServer(webServerInstance);
        logger.debug("Web server shut down.");
      }
      if (mcpServerRunning) {
        logger.debug("Shutting down MCP server...");
        await stopMcpServer();
        logger.debug("MCP server shut down.");
      }
      // Shut down active global services for HMR
      logger.debug("Shutting down active services...");
      if (activePipelineManager) {
        await activePipelineManager.stop();
        activePipelineManager = null; // Reset for next instantiation
        logger.debug("PipelineManager stopped.");
      }
      if (activeDocService) {
        await activeDocService.shutdown();
        activeDocService = null; // Reset for next instantiation
        logger.debug("DocumentManagementService shut down.");
      }
      logger.debug("Active services shut down.");
    } catch (hmrError) {
      logger.error(`❌ Error during HMR cleanup: ${hmrError}`);
    } finally {
      // Reset state for the next module instantiation
      webServerInstance = null;
      mcpServerRunning = false;
      // Only reset isShuttingDown if HMR itself initiated the shutdown state
      // and it wasn't already shutting down due to SIGINT or other error.
      if (!wasAlreadyShuttingDown) {
        isShuttingDown = false;
      }
    }
  });
}
