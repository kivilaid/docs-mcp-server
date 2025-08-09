/**
 * Scrape command - Scrapes and indexes documentation from a URL or local folder.
 */

import type { Command } from "commander";
import type { IPipeline, PipelineOptions } from "../../pipeline";
import { PipelineFactory } from "../../pipeline";
import { ScrapeMode } from "../../scraper/types";
import { DocumentManagementService } from "../../store/DocumentManagementService";
import { ScrapeTool } from "../../tools";
import {
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_PAGES,
} from "../../utils/config";
import { parseHeaders, setupLogging } from "../utils";

export function createScrapeCommand(program: Command): Command {
  return program
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
    .option(
      "--server-url <url>",
      "URL of external pipeline worker RPC (e.g., http://localhost:6280/trpc)",
    )
    .action(
      async (
        library: string,
        url: string,
        options: {
          version?: string;
          maxPages: string;
          maxDepth: string;
          maxConcurrency: string;
          ignoreErrors: boolean;
          scope: string;
          followRedirects: boolean;
          scrapeMode: ScrapeMode;
          includePattern: string[];
          excludePattern: string[];
          header: string[];
          serverUrl?: string;
        },
        command,
      ) => {
        const globalOptions = command.parent?.opts() || {};
        setupLogging(globalOptions);

        const docService = new DocumentManagementService();
        let pipeline: IPipeline | null = null;

        try {
          await docService.initialize();

          // Use server-url if provided, otherwise run locally
          const pipelineOptions: PipelineOptions = {
            recoverJobs: false, // CLI: no job recovery (immediate execution)
            concurrency: 1, // CLI: single job at a time
            serverUrl: options.serverUrl, // Use external worker if specified
          };

          pipeline = await PipelineFactory.createPipeline(docService, pipelineOptions);
          await pipeline.start();
          const scrapeTool = new ScrapeTool(pipeline);

          // Parse headers from CLI options
          const headers = parseHeaders(options.header);

          const result = await scrapeTool.execute({
            url,
            library,
            version: options.version,
            options: {
              maxPages: Number.parseInt(options.maxPages),
              maxDepth: Number.parseInt(options.maxDepth),
              maxConcurrency: Number.parseInt(options.maxConcurrency),
              ignoreErrors: options.ignoreErrors,
              scope: options.scope as "subpages" | "hostname" | "domain",
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

          if ("pagesScraped" in result) {
            console.log(`✅ Successfully scraped ${result.pagesScraped} pages`);
          } else {
            console.log(`🚀 Scraping job started with ID: ${result.jobId}`);
          }
        } finally {
          if (pipeline) await pipeline.stop();
          await docService.shutdown();
        }
      },
    );
}
