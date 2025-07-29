import { v4 as uuidv4 } from "uuid";
import { ScraperRegistry, ScraperService } from "../scraper";
import type { ScraperOptions } from "../scraper/types";
import type { DocumentManagementService } from "../store";
import { logger } from "../utils/logger";
import { PipelineWorker } from "./PipelineWorker"; // Import the worker
import { CancellationError, PipelineStateError } from "./errors";
import type { PipelineJob, PipelineManagerCallbacks } from "./types";
import { PipelineJobStatus } from "./types";

const DEFAULT_CONCURRENCY = 3;

/**
 * Manages a queue of document processing jobs, controlling concurrency and tracking progress.
 */
export class PipelineManager {
  private jobMap: Map<string, PipelineJob> = new Map();
  private jobQueue: string[] = [];
  private activeWorkers: Set<string> = new Set();
  private isRunning = false;
  private concurrency: number;
  private callbacks: PipelineManagerCallbacks = {};
  private store: DocumentManagementService;
  private scraperService: ScraperService;

  constructor(
    store: DocumentManagementService,
    concurrency: number = DEFAULT_CONCURRENCY,
  ) {
    this.store = store;
    this.concurrency = concurrency;
    // ScraperService needs a registry. We create one internally for the manager.
    const registry = new ScraperRegistry();
    this.scraperService = new ScraperService(registry);
  }

  /**
   * Registers callback handlers for pipeline manager events.
   */
  setCallbacks(callbacks: PipelineManagerCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Starts the pipeline manager's worker processing.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("⚠️  PipelineManager is already running.");
      return;
    }
    this.isRunning = true;
    logger.debug(`PipelineManager started with concurrency ${this.concurrency}.`);
    this._processQueue(); // Start processing any existing jobs
  }

  /**
   * Stops the pipeline manager and attempts to gracefully shut down workers.
   * Currently, it just stops processing new jobs. Cancellation of active jobs
   * needs explicit `cancelJob` calls.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn("⚠️  PipelineManager is not running.");
      return;
    }
    this.isRunning = false;
    logger.debug("PipelineManager stopping. No new jobs will be started.");
    // Note: Does not automatically cancel active jobs.
  }

  /**
   * Finds jobs by library, version, and optional status.
   */
  findJobsByLibraryVersion(
    library: string,
    version: string,
    statuses?: PipelineJobStatus[],
  ): PipelineJob[] {
    return Array.from(this.jobMap.values()).filter(
      (job) =>
        job.library === library &&
        job.version === version &&
        (!statuses || statuses.includes(job.status)),
    );
  }

  /**
   * Enqueues a new document processing job, aborting any existing QUEUED/RUNNING job for the same library+version (including unversioned).
   */
  async enqueueJob(
    library: string,
    version: string | undefined | null,
    options: ScraperOptions,
  ): Promise<string> {
    // Normalize version: treat undefined/null as "" (unversioned)
    const normalizedVersion = version ?? "";
    // Abort any existing QUEUED or RUNNING job for the same library+version
    const duplicateJobs = this.findJobsByLibraryVersion(library, normalizedVersion, [
      PipelineJobStatus.QUEUED,
      PipelineJobStatus.RUNNING,
    ]);
    for (const job of duplicateJobs) {
      logger.info(
        `🚫 Aborting duplicate job for ${library}@${normalizedVersion}: ${job.id}`,
      );
      await this.cancelJob(job.id);
    }

    const jobId = uuidv4();
    const abortController = new AbortController();
    let resolveCompletion!: () => void;
    let rejectCompletion!: (reason?: unknown) => void;

    const completionPromise = new Promise<void>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });

    const job: PipelineJob = {
      id: jobId,
      library,
      version: normalizedVersion,
      options,
      status: PipelineJobStatus.QUEUED,
      progress: null,
      error: null,
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null,
      abortController,
      completionPromise,
      resolveCompletion,
      rejectCompletion,
    };

    this.jobMap.set(jobId, job);
    this.jobQueue.push(jobId);
    logger.info(
      `📝 Job enqueued: ${jobId} for ${library}${normalizedVersion ? `@${normalizedVersion}` : " (unversioned)"}`,
    );

    await this.callbacks.onJobStatusChange?.(job);

    // Trigger processing if manager is running
    if (this.isRunning) {
      this._processQueue();
    }

    return jobId;
  }

  /**
   * Retrieves the current state of a specific job.
   */
  async getJob(jobId: string): Promise<PipelineJob | undefined> {
    return this.jobMap.get(jobId);
  }

  /**
   * Retrieves the current state of all jobs (or a subset based on status).
   */
  async getJobs(status?: PipelineJobStatus): Promise<PipelineJob[]> {
    const allJobs = Array.from(this.jobMap.values());
    if (status) {
      return allJobs.filter((job) => job.status === status);
    }
    return allJobs;
  }

  /**
   * Returns a promise that resolves when the specified job completes, fails, or is cancelled.
   * For cancelled jobs, this resolves successfully rather than rejecting.
   */
  async waitForJobCompletion(jobId: string): Promise<void> {
    const job = this.jobMap.get(jobId);
    if (!job) {
      throw new PipelineStateError(`Job not found: ${jobId}`);
    }

    try {
      await job.completionPromise;
    } catch (error) {
      // If the job was cancelled, treat it as successful completion
      if (
        error instanceof CancellationError ||
        job.status === PipelineJobStatus.CANCELLED
      ) {
        return; // Resolve successfully for cancelled jobs
      }
      // Re-throw other errors (failed jobs)
      throw error;
    }
  }

  /**
   * Attempts to cancel a queued or running job.
   */
  async cancelJob(jobId: string): Promise<void> {
    const job = this.jobMap.get(jobId);
    if (!job) {
      logger.warn(`❓ Attempted to cancel non-existent job: ${jobId}`);
      return;
    }

    switch (job.status) {
      case PipelineJobStatus.QUEUED:
        // Remove from queue and mark as cancelled
        this.jobQueue = this.jobQueue.filter((id) => id !== jobId);
        job.status = PipelineJobStatus.CANCELLED;
        job.finishedAt = new Date();
        logger.info(`🚫 Job cancelled (was queued): ${jobId}`);
        await this.callbacks.onJobStatusChange?.(job);
        job.rejectCompletion(new PipelineStateError("Job cancelled before starting"));
        break;

      case PipelineJobStatus.RUNNING:
        // Signal cancellation via AbortController
        job.status = PipelineJobStatus.CANCELLING;
        job.abortController.abort();
        logger.info(`🚫 Signalling cancellation for running job: ${jobId}`);
        await this.callbacks.onJobStatusChange?.(job);
        // The worker is responsible for transitioning to CANCELLED and rejecting
        break;

      case PipelineJobStatus.COMPLETED:
      case PipelineJobStatus.FAILED:
      case PipelineJobStatus.CANCELLED:
      case PipelineJobStatus.CANCELLING:
        logger.warn(
          `⚠️  Job ${jobId} cannot be cancelled in its current state: ${job.status}`,
        );
        break;

      default:
        logger.error(`❌ Unhandled job status for cancellation: ${job.status}`);
        break;
    }
  }

  /**
   * Removes all jobs that are in a final state (completed, cancelled, or failed).
   * Only removes jobs that are not currently in the queue or actively running.
   * @returns The number of jobs that were cleared.
   */
  async clearCompletedJobs(): Promise<number> {
    const completedStatuses = [
      PipelineJobStatus.COMPLETED,
      PipelineJobStatus.CANCELLED,
      PipelineJobStatus.FAILED,
    ];

    let clearedCount = 0;
    const jobsToRemove: string[] = [];

    // Find all jobs that can be cleared
    for (const [jobId, job] of this.jobMap.entries()) {
      if (completedStatuses.includes(job.status)) {
        jobsToRemove.push(jobId);
        clearedCount++;
      }
    }

    // Remove the jobs from the map
    for (const jobId of jobsToRemove) {
      this.jobMap.delete(jobId);
    }

    if (clearedCount > 0) {
      logger.info(`🧹 Cleared ${clearedCount} completed job(s) from the queue`);
    } else {
      logger.debug("No completed jobs to clear");
    }

    return clearedCount;
  }

  // --- Private Methods ---

  /**
   * Processes the job queue, starting new workers if capacity allows.
   */
  private _processQueue(): void {
    if (!this.isRunning) return;

    while (this.activeWorkers.size < this.concurrency && this.jobQueue.length > 0) {
      const jobId = this.jobQueue.shift();
      if (!jobId) continue; // Should not happen, but safety check

      const job = this.jobMap.get(jobId);
      if (!job || job.status !== PipelineJobStatus.QUEUED) {
        logger.warn(`⏭️ Skipping job ${jobId} in queue (not found or not queued).`);
        continue;
      }

      this.activeWorkers.add(jobId);
      job.status = PipelineJobStatus.RUNNING;
      job.startedAt = new Date();
      this.callbacks.onJobStatusChange?.(job); // Fire and forget status update

      // Start the actual job execution asynchronously
      this._runJob(job).catch((error) => {
        // Catch unexpected errors during job setup/execution not handled by _runJob itself
        logger.error(`❌ Unhandled error during job ${jobId} execution: ${error}`);
        if (
          job.status !== PipelineJobStatus.FAILED &&
          job.status !== PipelineJobStatus.CANCELLED
        ) {
          job.status = PipelineJobStatus.FAILED;
          job.error = error instanceof Error ? error : new Error(String(error));
          job.finishedAt = new Date();
          this.callbacks.onJobStatusChange?.(job); // Fire and forget
          job.rejectCompletion(job.error);
        }
        this.activeWorkers.delete(jobId);
        this._processQueue(); // Check if another job can start
      });
    }
  }

  /**
   * Executes a single pipeline job by delegating to a PipelineWorker.
   * Handles final status updates and promise resolution/rejection.
   */
  private async _runJob(job: PipelineJob): Promise<void> {
    const { id: jobId, abortController } = job;
    const signal = abortController.signal; // Get signal for error checking

    // Instantiate a worker for this job.
    // Dependencies (store, scraperService) are held by the manager.
    const worker = new PipelineWorker(this.store, this.scraperService);

    try {
      // Delegate the actual work to the worker
      await worker.executeJob(job, this.callbacks);

      // If executeJob completes without throwing, and we weren't cancelled meanwhile...
      if (signal.aborted) {
        // Check signal again in case cancellation happened *during* the very last await in executeJob
        throw new CancellationError("Job cancelled just before completion");
      }

      // Mark as completed
      job.status = PipelineJobStatus.COMPLETED;
      job.finishedAt = new Date();
      await this.callbacks.onJobStatusChange?.(job);
      job.resolveCompletion();

      logger.info(`✅ Job completed: ${jobId}`);
    } catch (error) {
      // Handle errors thrown by the worker, including CancellationError
      if (error instanceof CancellationError || signal.aborted) {
        // Explicitly check for CancellationError or if the signal was aborted
        job.status = PipelineJobStatus.CANCELLED;
        job.finishedAt = new Date();
        // Don't set job.error for cancellations - cancellation is not an error condition
        const cancellationError =
          error instanceof CancellationError
            ? error
            : new CancellationError("Job cancelled by signal");
        logger.info(`🚫 Job execution cancelled: ${jobId}: ${cancellationError.message}`);
        await this.callbacks.onJobStatusChange?.(job);
        job.rejectCompletion(cancellationError);
      } else {
        // Handle other errors
        job.status = PipelineJobStatus.FAILED;
        job.error = error instanceof Error ? error : new Error(String(error));
        job.finishedAt = new Date();
        logger.error(`❌ Job failed: ${jobId}: ${job.error}`);
        await this.callbacks.onJobStatusChange?.(job);
        job.rejectCompletion(job.error);
      }
    } finally {
      // Ensure worker slot is freed and queue processing continues
      this.activeWorkers.delete(jobId);
      this._processQueue();
    }
  }
}
