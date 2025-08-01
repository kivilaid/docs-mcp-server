import type { PipelineManager } from "../pipeline/PipelineManager";
import { PipelineJobStatus } from "../pipeline/types";
import type { DocumentManagementService } from "../store";
import { logger } from "../utils/logger";
import { ToolError } from "./errors";

/**
 * Represents the arguments for the remove_docs tool.
 * The MCP server should validate the input against RemoveToolInputSchema before calling execute.
 */
export interface RemoveToolArgs {
  library: string;
  version?: string;
}

/**
 * Tool to remove indexed documentation for a specific library version.
 * This class provides the core logic, intended to be called by the McpServer.
 */
export class RemoveTool {
  constructor(
    private readonly documentManagementService: DocumentManagementService,
    private readonly pipelineManager: PipelineManager,
  ) {}

  /**
   * Executes the tool to remove the specified library version documents.
   * Aborts any QUEUED/RUNNING job for the same library+version before deleting.
   */
  async execute(args: RemoveToolArgs): Promise<{ message: string }> {
    const { library, version } = args;

    logger.info(
      `🗑️ Removing library: ${library}${version ? `, version: ${version}` : " (unversioned)"}`,
    );

    try {
      // Abort any QUEUED or RUNNING job for this library+version
      const jobs = this.pipelineManager.findJobsByLibraryVersion(
        library,
        (version ?? "").toLowerCase(),
        [PipelineJobStatus.QUEUED, PipelineJobStatus.RUNNING],
      );
      for (const job of jobs) {
        logger.info(
          `🚫 Aborting job for ${library}@${version ?? ""} before deletion: ${job.id}`,
        );
        await this.pipelineManager.cancelJob(job.id);
        // Wait for job to finish cancelling if running
        await this.pipelineManager.waitForJobCompletion(job.id);
      }
      // Core logic: Call the document management service
      await this.documentManagementService.removeAllDocuments(library, version);

      const message = `Successfully removed documents for ${library}${version ? `@${version}` : " (unversioned)"}.`;
      logger.info(`✅ ${message}`);
      // Return a simple success object, the McpServer will format the final response
      return { message };
    } catch (error) {
      const errorMessage = `Failed to remove documents for ${library}${version ? `@${version}` : " (unversioned)"}: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`❌ Error removing library: ${errorMessage}`);
      // Re-throw the error for the McpServer to handle and format
      throw new ToolError(errorMessage, this.constructor.name);
    }
  }
}
