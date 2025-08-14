/**
 * Remove command - Removes documents for a specific library and version.
 */

import type { Command } from "commander";
import { createDocumentManagement } from "../../store";
import { setupLogging } from "../utils";

export async function removeAction(
  library: string,
  options: { version?: string; serverUrl?: string },
  command: Command,
) {
  const globalOptions = command.parent?.opts() || {};
  setupLogging(globalOptions);
  const serverUrl = options.serverUrl;
  const docService = await createDocumentManagement({ serverUrl });
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
}

export function createRemoveCommand(program: Command): Command {
  return program
    .command("remove <library>")
    .description("Remove documents for a specific library and version")
    .option(
      "-v, --version <string>",
      "Version to remove (optional, removes unversioned if omitted)",
    )
    .option(
      "--server-url <url>",
      "URL of external pipeline worker RPC (e.g., http://localhost:6280/api)",
    )
    .action(removeAction);
}
