/**
 * Find version command - Finds the best matching version for a library.
 */

import type { Command } from "commander";
import { createDocumentManagement } from "../../store";
import { FindVersionTool } from "../../tools";
import { setupLogging } from "../utils";

export function createFindVersionCommand(program: Command): Command {
  return program
    .command("find-version <library>")
    .description("Find the best matching version for a library")
    .option("-v, --version <string>", "Pattern to match (optional, supports ranges)")
    .action(async (library: string, options: { version?: string }, command) => {
      const globalOptions = command.parent?.opts() || {};
      setupLogging(globalOptions);

      const docService = await createDocumentManagement();
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
    });
}
