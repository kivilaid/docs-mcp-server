/**
 * List command - Lists all available libraries and their versions.
 */

import type { Command } from "commander";
import { createDocumentManagement } from "../../store";
import { extractCliFlags, trackTool } from "../../telemetry";
import { ListLibrariesTool } from "../../tools";
import type { ListLibrariesResult } from "../../tools/ListLibrariesTool";
import { formatOutput, setupLogging } from "../utils";

export async function listAction(options: { serverUrl?: string }, command: Command) {
  const globalOptions = command.parent?.opts() || {};
  setupLogging(globalOptions);
  const { serverUrl } = options;
  const docService = await createDocumentManagement({ serverUrl });
  try {
    const listLibrariesTool = new ListLibrariesTool(docService);

    // Track command execution with privacy-safe analytics
    const result = await trackTool(
      "list_libraries",
      () => listLibrariesTool.execute(),
      (result: ListLibrariesResult) => ({
        library_count: result.libraries.length,
        using_remote_server: !!serverUrl,
        cli_flags: extractCliFlags(process.argv),
      }),
    );

    console.log(formatOutput(result.libraries));
  } finally {
    await docService.shutdown();
  }
}

export function createListCommand(program: Command): Command {
  return program
    .command("list")
    .description("List all available libraries and their versions")
    .option(
      "--server-url <url>",
      "URL of external pipeline worker RPC (e.g., http://localhost:6280/api)",
    )
    .action(listAction);
}
