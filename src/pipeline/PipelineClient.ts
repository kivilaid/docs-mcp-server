/**
 * HTTP client implementation of the Pipeline interface.
 * Delegates all pipeline operations to an external worker via HTTP API.
 */

import type { ScraperOptions, ScraperProgress } from "../scraper/types";
import { logger } from "../utils/logger";
import type { IPipeline } from "./interfaces";
import type { PipelineJob, PipelineJobStatus, PipelineManagerCallbacks } from "./types";

/**
 * HTTP client that implements the IPipeline interface by delegating to external worker.
 */
export class PipelineClient implements IPipeline {
  private readonly baseUrl: string;
  private callbacks: PipelineManagerCallbacks = {};
  private pollingInterval: number = 1000; // 1 second
  private activePolling = new Set<string>(); // Track jobs being polled for completion

  constructor(serverUrl: string) {
    // Use the provided URL as-is, just remove trailing slash for consistency
    this.baseUrl = serverUrl.replace(/\/$/, "");
    logger.debug(`PipelineClient created for: ${this.baseUrl}`);
  }

  async start(): Promise<void> {
    // Check if external worker is available
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`External worker health check failed: ${response.status}`);
      }
      logger.debug("PipelineClient connected to external worker");
    } catch (error) {
      throw new Error(
        `Failed to connect to external worker at ${this.baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async stop(): Promise<void> {
    // Clear any active polling
    this.activePolling.clear();
    logger.debug("PipelineClient stopped");
  }

  async enqueueJob(
    library: string,
    version: string | undefined | null,
    options: ScraperOptions,
  ): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          library,
          version,
          options,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to enqueue job: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      const jobId = result.jobId;

      logger.debug(`Job ${jobId} enqueued successfully`);
      return jobId;
    } catch (error) {
      throw new Error(
        `Failed to enqueue job: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getJob(jobId: string): Promise<PipelineJob | undefined> {
    try {
      const response = await fetch(`${this.baseUrl}/jobs/${jobId}`);

      if (response.status === 404) {
        return undefined;
      }

      if (!response.ok) {
        throw new Error(`Failed to get job: ${response.status} ${response.statusText}`);
      }

      const job = await response.json();
      return job;
    } catch (error) {
      throw new Error(
        `Failed to get job ${jobId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getJobs(status?: PipelineJobStatus): Promise<PipelineJob[]> {
    try {
      const url = new URL(`${this.baseUrl}/jobs`);
      if (status) {
        url.searchParams.set("status", status);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get jobs: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      return result.jobs || [];
    } catch (error) {
      logger.error(`Failed to get jobs from external worker: ${error}`);
      throw error;
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/jobs/${jobId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to cancel job: ${response.status} ${errorText}`);
      }

      logger.debug(`Job cancelled via external worker: ${jobId}`);
    } catch (error) {
      logger.error(`Failed to cancel job ${jobId} via external worker: ${error}`);
      throw error;
    }
  }

  async clearCompletedJobs(): Promise<number> {
    try {
      const response = await fetch(`${this.baseUrl}/jobs`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to clear completed jobs: ${response.status} ${errorText}`,
        );
      }

      const result = await response.json();
      logger.debug(`Cleared ${result.count} completed jobs via external worker`);
      return result.count || 0;
    } catch (error) {
      logger.error(`Failed to clear completed jobs via external worker: ${error}`);
      throw error;
    }
  }

  async waitForJobCompletion(jobId: string): Promise<void> {
    if (this.activePolling.has(jobId)) {
      throw new Error(`Already waiting for completion of job ${jobId}`);
    }

    this.activePolling.add(jobId);

    try {
      while (this.activePolling.has(jobId)) {
        const job = await this.getJob(jobId);
        if (!job) {
          throw new Error(`Job ${jobId} not found`);
        }

        // Check if job is in final state
        if (
          job.status === "completed" ||
          job.status === "failed" ||
          job.status === "cancelled"
        ) {
          if (job.status === "failed" && job.error) {
            throw job.error;
          }
          return;
        }

        // Poll every second
        await new Promise((resolve) => setTimeout(resolve, this.pollingInterval));
      }
    } finally {
      this.activePolling.delete(jobId);
    }
  }

  setCallbacks(callbacks: PipelineManagerCallbacks): void {
    this.callbacks = callbacks;
  }

  async updateJobProgress(job: PipelineJob, progress: ScraperProgress): Promise<void> {
    // This method is called by the manager when it receives progress updates
    // For external pipeline, this is typically a no-op since progress comes from external worker
    // But we can trigger our callback if set
    await this.callbacks.onJobProgress?.(job, progress);
  }
}
