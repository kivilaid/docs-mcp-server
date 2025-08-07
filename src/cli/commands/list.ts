/**
 * List command - Lists all available libraries and their versions.
 */

import type { Command } from "commander";
import { ListLibrariesTool } from "../../tools";
import { formatOutput, initializeDocumentService, setupLogging } from "../utils";

export function createListCommand(program: Command): Command {
  return program
    .command("list")
    .description("List all available libraries and their versions")
    .action(async (command) => {
      const globalOptions = command.opts() || {};
      setupLogging(globalOptions);

      const docService = await initializeDocumentService();
      try {
        const listLibrariesTool = new ListLibrariesTool(docService);
        const result = await listLibrariesTool.execute();
        console.log(formatOutput(result.libraries));
      } finally {
        await docService.shutdown();
      }
    });
}
