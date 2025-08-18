/**
 * Search command - Searches documents in a library.
 */

import type { Command } from "commander";
import { createDocumentManagement } from "../../store";
import { SearchTool } from "../../tools";
import { formatOutput, setupLogging } from "../utils";

export async function searchAction(
  library: string,
  query: string,
  options: { version?: string; limit: string; exactMatch: boolean; serverUrl?: string },
  command: Command,
) {
  const globalOptions = command.parent?.opts() || {};
  setupLogging(globalOptions);
  const serverUrl = options.serverUrl;
  const docService = await createDocumentManagement({ serverUrl });
  try {
    const searchTool = new SearchTool(docService);
    const result = await searchTool.execute({
      library,
      version: options.version,
      query,
      limit: Number.parseInt(options.limit, 10),
      exactMatch: options.exactMatch,
    });
    console.log(formatOutput(result.results));
  } finally {
    await docService.shutdown();
  }
}

export function createSearchCommand(program: Command): Command {
  return program
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
    .option(
      "--server-url <url>",
      "URL of external pipeline worker RPC (e.g., http://localhost:6280/api)",
    )
    .action(searchAction);
}
