import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import "dotenv/config";
import { Command } from "commander";
import { chromium } from "playwright";
import packageJson from "../package.json";
import { type AppServerConfig, startAppServer } from "./app";
import { type IPipeline, PipelineFactory, type PipelineOptions } from "./pipeline";
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
let activeAppServer: ReturnType<typeof startAppServer> | null = null;
let activeDocService: DocumentManagementService | null = null;
let activePipelineManager: IPipeline | null = null;

let isShuttingDown = false; // Use a module-level boolean

const sigintHandler = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.debug("Received SIGINT. Shutting down gracefully...");
  try {
    if (activeAppServer) {
      logger.debug("SIGINT: Stopping AppServer...");
      const appServer = await activeAppServer;
      await appServer.stop();
      activeAppServer = null;
      logger.debug("SIGINT: AppServer stopped.");
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

    logger.info("✅ Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    logger.error(`❌ Error during graceful shutdown: ${error}`);
    process.exit(1);
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

  async function ensurePipelineManagerInitialized(
    options: PipelineOptions = {},
  ): Promise<IPipeline> {
    const ds = await ensureDocServiceInitialized(); // Depends on DocService
    if (!activePipelineManager) {
      logger.debug(
        `Initializing PipelineManager with options: ${JSON.stringify(options)}`,
      );
      const manager = await PipelineFactory.createPipeline(ds, options);

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
      logger.debug("PipelineManager initialized.");
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
      )
      .option(
        "--server-url <url>",
        "URL of external pipeline worker server (for web interface or external worker mode)",
      );

    program.hook("preAction", (thisCommand, actionCommand) => {
      const globalOptions = thisCommand.opts();
      if (globalOptions.silent) setLogLevel(LogLevel.ERROR);
      else if (globalOptions.verbose) setLogLevel(LogLevel.DEBUG);
      if (actionCommand.name() !== program.name()) commandExecuted = true;
    });

    // --- MCP Command ---
    program
      .command("mcp")
      .description("Start MCP server only")
      .option("--port <number>", "Port for the MCP server", DEFAULT_HTTP_PORT.toString())
      .option(
        "--server-url <url>",
        "URL of external pipeline worker server (required for MCP-only mode)",
      )
      .action(async (cmdOptions, command) => {
        commandExecuted = true;
        const globalOptions = command.parent?.opts() || {};
        const port = Number.parseInt(cmdOptions.port);
        const serverUrl = cmdOptions.serverUrl || globalOptions.serverUrl;

        if (Number.isNaN(port) || port < 1 || port > 65535) {
          console.error("❌ Invalid port number");
          process.exit(1);
        }

        if (!serverUrl) {
          console.error("❌ MCP-only mode requires --server-url parameter");
          console.error("Example usage:");
          console.error("  1. Start worker: docs-mcp-server worker --port 8080");
          console.error(
            "  2. Start MCP: docs-mcp-server mcp --server-url http://localhost:8080",
          );
          process.exit(1);
        }

        try {
          const docService = await ensureDocServiceInitialized();
          const pipeline = await ensurePipelineManagerInitialized({
            recoverJobs: false, // MCP-only mode uses external worker
            serverUrl,
            concurrency: 3,
          });

          // Configure MCP-only server
          const config: AppServerConfig = {
            enableWebInterface: false,
            enableMcpServer: true,
            enablePipelineApi: false,
            enableWorker: false,
            port,
            externalWorkerUrl: serverUrl,
          };

          logger.info(`🚀 Starting MCP server connecting to worker at ${serverUrl}`);
          activeAppServer = startAppServer(docService, pipeline, config);
          await activeAppServer; // Wait for startup to complete

          await new Promise(() => {}); // Keep running forever
        } catch (error) {
          logger.error(`❌ Failed to start MCP server: ${error}`);
          process.exit(1);
        }
      });

    // --- Web Command ---
    program
      .command("web")
      .description("Start web interface only")
      .option(
        "--port <number>",
        "Port for the web interface",
        DEFAULT_WEB_PORT.toString(),
      )
      .option(
        "--server-url <url>",
        "URL of external pipeline worker server (required for web-only mode)",
      )
      .action(async (cmdOptions, command) => {
        commandExecuted = true;
        const globalOptions = command.parent?.opts() || {};
        const port = Number.parseInt(cmdOptions.port);
        const serverUrl = cmdOptions.serverUrl || globalOptions.serverUrl;

        if (Number.isNaN(port) || port < 1 || port > 65535) {
          console.error("❌ Invalid port number");
          process.exit(1);
        }

        if (!serverUrl) {
          console.error("❌ Web-only mode requires --server-url parameter");
          console.error("Example usage:");
          console.error("  1. Start worker: docs-mcp-server worker --port 8080");
          console.error(
            "  2. Start web: docs-mcp-server web --server-url http://localhost:8080",
          );
          process.exit(1);
        }

        try {
          const docService = await ensureDocServiceInitialized();
          const pipeline = await ensurePipelineManagerInitialized({
            recoverJobs: false, // Web-only mode uses external worker
            serverUrl,
            concurrency: 3,
          });

          // Configure web-only server
          const config: AppServerConfig = {
            enableWebInterface: true,
            enableMcpServer: false,
            enablePipelineApi: false,
            enableWorker: false,
            port,
            externalWorkerUrl: serverUrl,
          };

          logger.info(`🚀 Starting web interface connecting to worker at ${serverUrl}`);
          activeAppServer = startAppServer(docService, pipeline, config);
          await activeAppServer; // Wait for startup to complete

          await new Promise(() => {}); // Keep running forever
        } catch (error) {
          logger.error(`❌ Failed to start web interface: ${error}`);
          process.exit(1);
        }
      });

    // --- Worker Command ---
    program
      .command("worker")
      .description("Start external pipeline worker (HTTP API)")
      .option("--port <number>", "Port for worker API", "8080")
      .action(async (cmdOptions, _command) => {
        commandExecuted = true;
        const port = Number.parseInt(cmdOptions.port);

        if (Number.isNaN(port) || port < 1 || port > 65535) {
          console.error("❌ Invalid port number");
          process.exit(1);
        }

        try {
          logger.info(`🚀 Starting external pipeline worker on port ${port}`);

          // Ensure browsers are installed for scraping
          ensurePlaywrightBrowsersInstalled();

          // Initialize services
          const docService = await ensureDocServiceInitialized();
          const pipeline = await ensurePipelineManagerInitialized({
            recoverJobs: true, // Workers recover jobs on startup
            concurrency: DEFAULT_MAX_CONCURRENCY,
          });

          // Configure worker-only server
          const config: AppServerConfig = {
            enableWebInterface: false,
            enableMcpServer: false,
            enablePipelineApi: true,
            enableWorker: true,
            port,
          };

          logger.info(`🚀 Starting external pipeline worker with HTTP API`);
          activeAppServer = startAppServer(docService, pipeline, config);
          await activeAppServer; // Wait for startup to complete

          await new Promise(() => {}); // Keep running forever
        } catch (error) {
          logger.error(`❌ Failed to start external pipeline worker: ${error}`);
          process.exit(1);
        }
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
      .action(async (library, url, options, command) => {
        commandExecuted = true; // Ensure this is set for CLI commands
        const globalOptions = command.parent?.opts() || {};
        const docService = new DocumentManagementService();
        let pipeline: IPipeline | null = null;
        try {
          await docService.initialize();

          // Use global server-url if provided, otherwise run locally
          const pipelineOptions: PipelineOptions = {
            recoverJobs: false, // CLI: no job recovery (immediate execution)
            concurrency: 1, // CLI: single job at a time
            serverUrl: globalOptions.serverUrl, // Use external worker if specified
          };

          pipeline = await PipelineFactory.createPipeline(docService, pipelineOptions);
          await pipeline.start();
          const scrapeTool = new ScrapeTool(pipeline);

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
          if (pipeline) await pipeline.stop();
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
        commandExecuted = true;
        logger.debug("No subcommand specified, starting unified server by default...");
        const port = Number.parseInt(options.port, 10);
        if (Number.isNaN(port)) {
          console.error("Port must be a number.");
          process.exit(1);
        }

        const docService = await ensureDocServiceInitialized();
        const pipeline = await ensurePipelineManagerInitialized({
          recoverJobs: !options.serverUrl, // Only recover jobs if using embedded worker
          serverUrl: options.serverUrl,
          concurrency: 3,
        });

        // Configure unified server (web + MCP + pipeline API + worker)
        const config: AppServerConfig = {
          enableWebInterface: true,
          enableMcpServer: true,
          enablePipelineApi: true,
          enableWorker: !options.serverUrl, // Use embedded worker unless external URL provided
          port,
          externalWorkerUrl: options.serverUrl,
        };

        logger.info("🚀 Starting unified server (web + MCP + pipeline + worker)");
        activeAppServer = startAppServer(docService, pipeline, config);
        await activeAppServer; // Wait for startup to complete

        await new Promise(() => {}); // Keep running forever
      }
    });

    await program.parseAsync(process.argv);
  } catch (error) {
    logger.error(`❌ Error in main: ${error}`);
    if (!isShuttingDown) {
      isShuttingDown = true;
      if (activeAppServer) {
        try {
          const appServer = await activeAppServer;
          await appServer.stop();
        } catch (e) {
          logger.error(`❌ Error stopping AppServer: ${e}`);
        }
      }

      // Shutdown other active global services if they exist
      if (activePipelineManager) {
        try {
          await activePipelineManager.stop();
          activePipelineManager = null;
        } catch (e) {
          logger.error(`❌ Error stopping pipeline: ${e}`);
        }
      }
      if (activeDocService) {
        try {
          await activeDocService.shutdown();
          activeDocService = null;
        } catch (e) {
          logger.error(`❌ Error shutting down doc service: ${e}`);
        }
      }
    }
    process.exit(1);
  }

  // This block handles cleanup for CLI commands that completed successfully
  // and were not long-running servers.
  if (commandExecuted && !activeAppServer) {
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
      if (activeAppServer) {
        logger.debug("Shutting down AppServer...");
        const appServer = await activeAppServer;
        await appServer.stop();
        logger.debug("AppServer shut down.");
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
      activeAppServer = null;
      // Only reset isShuttingDown if HMR itself initiated the shutdown state
      // and it wasn't already shutting down due to SIGINT or other error.
      if (!wasAlreadyShuttingDown) {
        isShuttingDown = false;
      }
    }
  });
}
