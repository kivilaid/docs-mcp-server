import type { DocumentManagementService } from "../store";
import { DEFAULT_MAX_CONCURRENCY } from "../utils/config";
import { logger } from "../utils/logger";
import type { IPipeline, PipelineOptions } from "./interfaces";
import { PipelineManager } from "./PipelineManager";

/**
 * Factory for creating pipeline interfaces based on functionality requirements.
 */
export namespace PipelineFactory {
  /**
   * Creates the appropriate pipeline interface based on desired functionality.
   *
   * @param docService - Document management service instance
   * @param options - Pipeline configuration options
   * @returns Pipeline interface (PipelineManager or future PipelineClient)
   */
  export async function createPipeline(
    docService: DocumentManagementService,
    options: PipelineOptions = {},
  ): Promise<IPipeline> {
    const {
      recoverJobs = false, // Default to false for safety
      serverUrl,
      concurrency = DEFAULT_MAX_CONCURRENCY,
    } = options;

    logger.debug(
      `Creating pipeline: recoverJobs=${recoverJobs}, serverUrl=${serverUrl || "none"}, concurrency=${concurrency}`,
    );

    if (serverUrl) {
      // External pipeline requested
      throw new Error(
        `External pipeline support not yet implemented. Remove serverUrl to use embedded pipeline.`,
      );
    }

    // Local embedded pipeline with specified behavior
    return new PipelineManager(docService, concurrency, { recoverJobs });
  }
}
