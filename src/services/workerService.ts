/**
 * Worker service that enables the embedded pipeline worker functionality.
 * This service starts the pipeline and configures it for background job processing.
 */

import type { IPipeline } from "../pipeline/trpc/interfaces";
import { analytics, TelemetryEvent } from "../utils/analytics";
import {
  categorizeError,
  isRecoverableError,
  sanitizeJobId,
} from "../utils/dataSanitizer";
import { logger } from "../utils/logger";

/**
 * Register worker service to enable embedded pipeline processing.
 * This starts the pipeline and configures callbacks for job processing.
 */
export async function registerWorkerService(pipeline: IPipeline): Promise<void> {
  // Configure progress callbacks for logging and analytics
  pipeline.setCallbacks({
    onJobProgress: async (job, progress) => {
      logger.debug(
        `Job ${job.id} progress: ${progress.pagesScraped}/${progress.totalPages} pages`,
      );

      // Track job progress for analytics with enhanced metrics
      analytics.track(TelemetryEvent.PIPELINE_JOB_PROGRESS, {
        jobId: sanitizeJobId(job.id),
        library: job.library,
        pagesScraped: progress.pagesScraped,
        totalPages: progress.totalPages,
        totalDiscovered: progress.totalDiscovered,
        progressPercent: Math.round((progress.pagesScraped / progress.totalPages) * 100),
        currentDepth: progress.depth,
        maxDepth: progress.maxDepth,
        discoveryRatio: Math.round(
          (progress.totalDiscovered / progress.totalPages) * 100,
        ), // How much we discovered vs limited total
        queue_efficiency:
          progress.totalPages > 0
            ? Math.round((progress.pagesScraped / progress.totalPages) * 100)
            : 0,
      });
    },
    onJobStatusChange: async (job) => {
      logger.debug(`Job ${job.id} status changed to: ${job.status}`);

      // Enhanced job completion tracking
      const duration = job.startedAt ? Date.now() - job.startedAt.getTime() : null;
      const queueWaitTime =
        job.startedAt && job.createdAt
          ? job.startedAt.getTime() - job.createdAt.getTime()
          : null;

      analytics.track(TelemetryEvent.PIPELINE_JOB_COMPLETED, {
        jobId: sanitizeJobId(job.id),
        library: job.library,
        status: job.status,
        duration_ms: duration,
        queue_wait_time_ms: queueWaitTime,
        pages_processed: job.progressPages || 0,
        max_pages_configured: job.progressMaxPages || 0,
        has_version: !!job.version,
        has_error: !!job.error,
        throughput_pages_per_second:
          duration && job.progressPages
            ? Math.round((job.progressPages / duration) * 1000)
            : 0,
      });
    },
    onJobError: async (job, error, document) => {
      logger.warn(
        `⚠️ Job ${job.id} error ${document ? `on document ${document.metadata.url}` : ""}: ${error.message}`,
      );

      // Enhanced error tracking with more context
      analytics.track(TelemetryEvent.ERROR_OCCURRED, {
        jobId: sanitizeJobId(job.id),
        library: job.library,
        errorType: error.constructor.name,
        hasDocument: !!document,
        stage: document ? "document_processing" : "job_setup",
        error_category: categorizeError(error),
        is_recoverable: isRecoverableError(error),
        pages_processed_before_error: job.progressPages || 0,
      });
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
