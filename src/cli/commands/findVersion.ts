/**
 * Find version command - Finds the best matching version for a library.
 */

import type { Command } from "commander";
import { createDocumentManagement } from "../../store";
import { FindVersionTool } from "../../tools";
import { setupLogging } from "../utils";

export async function findVersionAction(
  library: string,
  options: { version?: string; serverUrl?: string },
  command: Command,
) {
  const globalOptions = command.parent?.opts() || {};
  setupLogging(globalOptions);
  const serverUrl = options.serverUrl;
  const docService = await createDocumentManagement({ serverUrl });
  try {
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
}

export function createFindVersionCommand(program: Command): Command {
  return program
    .command("find-version <library>")
    .description("Find the best matching version for a library")
    .option("-v, --version <string>", "Pattern to match (optional, supports ranges)")
    .option(
      "--server-url <url>",
      "URL of external pipeline worker RPC (e.g., http://localhost:6280/api)",
    )
    .action(findVersionAction);
}
