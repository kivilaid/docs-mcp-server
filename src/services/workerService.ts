/**
 * Worker service that enables the embedded pipeline worker functionality.
 * This service starts the pipeline and configures it for background job processing.
 */

import type { IPipeline } from "../pipeline/trpc/interfaces";
import { logger } from "../utils/logger";

/**
 * Register worker service to enable embedded pipeline processing.
 * This starts the pipeline and configures callbacks for job processing.
 */
export async function registerWorkerService(pipeline: IPipeline): Promise<void> {
  // Configure progress callbacks for logging
  pipeline.setCallbacks({
    onJobProgress: async (job, progress) => {
      logger.debug(
        `Job ${job.id} progress: ${progress.pagesScraped}/${progress.totalPages} pages`,
      );
    },
    onJobStatusChange: async (job) => {
      logger.debug(`Job ${job.id} status changed to: ${job.status}`);
    },
    onJobError: async (job, error, document) => {
      logger.warn(
        `⚠️ Job ${job.id} error ${document ? `on document ${document.metadata.url}` : ""}: ${error.message}`,
      );
    },
  });

  // Start the pipeline for job processing
  await pipeline.start();
  logger.debug("Worker service started");
}

/**
 * Stop the worker service and cleanup resources.
 */
export async function stopWorkerService(pipeline: IPipeline): Promise<void> {
  await pipeline.stop();
  logger.debug("Worker service stopped");
}
