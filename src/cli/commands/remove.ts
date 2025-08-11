/**
 * Remove command - Removes documents for a specific library and version.
 */

import type { Command } from "commander";
import { createDocumentManagement } from "../../store";
import { setupLogging } from "../utils";

export function createRemoveCommand(program: Command): Command {
  return program
    .command("remove <library>")
    .description("Remove documents for a specific library and version")
    .option(
      "-v, --version <string>",
      "Version to remove (optional, removes unversioned if omitted)",
    )
    .action(async (library: string, options: { version?: string }, command) => {
      const globalOptions = command.parent?.opts() || {};
      setupLogging(globalOptions);

      const docService = await createDocumentManagement();
      const { version } = options;
      try {
        await docService.removeAllDocuments(library, version);
        console.log(
          `✅ Successfully removed documents for ${library}${version ? `@${version}` : " (unversioned)"}.`,
        );
      } catch (error) {
        console.error(
          `❌ Failed to remove documents for ${library}${version ? `@${version}` : " (unversioned)"}:`,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      } finally {
        await docService.shutdown();
      }
    });
}
