/**
 * HTTP API service that exposes PipelineManager functionality via REST endpoints.
 * Used by external workers to provide pipeline services to remote clients.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ScraperOptions } from "../scraper/types";
import { logger } from "../utils/logger";
import type { IPipeline } from "./interfaces";
import { type PipelineJob, PipelineJobStatus } from "./types";

/**
 * Request/Response types for the pipeline API
 */
interface EnqueueJobRequest {
  library: string;
  version?: string | null;
  options: ScraperOptions;
}

interface EnqueueJobResponse {
  jobId: string;
}

interface GetJobsResponse {
  jobs: PipelineJob[];
}

interface ClearJobsResponse {
  count: number;
}

/**
 * API service that provides HTTP endpoints for pipeline operations.
 */
export class PipelineApiService {
  private pipeline: IPipeline;

  constructor(pipeline: IPipeline) {
    this.pipeline = pipeline;
  }

  /**
   * Registers all pipeline API routes with the given Fastify instance.
   */
  async registerRoutes(server: FastifyInstance): Promise<void> {
    // Health check endpoint
    server.get("/api/health", async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ status: "ok", timestamp: new Date().toISOString() });
    });

    // Detailed health check
    server.get(
      "/api/health/detailed",
      async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
          const jobs = await this.pipeline.getJobs();
          return reply.send({
            status: "ok",
            timestamp: new Date().toISOString(),
            jobCounts: {
              total: jobs.length,
              queued: jobs.filter((j) => j.status === PipelineJobStatus.QUEUED).length,
              running: jobs.filter((j) => j.status === PipelineJobStatus.RUNNING).length,
              completed: jobs.filter((j) => j.status === PipelineJobStatus.COMPLETED)
                .length,
              failed: jobs.filter((j) => j.status === PipelineJobStatus.FAILED).length,
              cancelled: jobs.filter((j) => j.status === PipelineJobStatus.CANCELLED)
                .length,
            },
          });
        } catch (error) {
          return reply.status(500).send({
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );

    // Enqueue a new job
    server.post<{ Body: EnqueueJobRequest; Reply: EnqueueJobResponse }>(
      "/api/jobs",
      async (
        request: FastifyRequest<{ Body: EnqueueJobRequest }>,
        reply: FastifyReply,
      ) => {
        try {
          const { library, version, options } = request.body;

          if (!library || !options) {
            return reply
              .status(400)
              .send({ error: "Missing required fields: library, options" });
          }

          const jobId = await this.pipeline.enqueueJob(library, version, options);

          logger.debug(
            `API: Enqueued job ${jobId} for ${library}@${version || "unversioned"}`,
          );

          return reply.send({ jobId });
        } catch (error) {
          logger.error(`API: Failed to enqueue job: ${error}`);
          return reply.status(500).send({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );

    // Get all jobs (with optional status filter)
    server.get<{ Querystring: { status?: PipelineJobStatus }; Reply: GetJobsResponse }>(
      "/api/jobs",
      async (
        request: FastifyRequest<{ Querystring: { status?: PipelineJobStatus } }>,
        reply: FastifyReply,
      ) => {
        try {
          const { status } = request.query;
          const jobs = await this.pipeline.getJobs(status);

          // Jobs are already in public format, no serialization needed
          return reply.send({ jobs });
        } catch (error) {
          logger.error(`API: Failed to get jobs: ${error}`);
          return reply.status(500).send({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );

    // Get specific job by ID
    server.get<{ Params: { id: string } }>(
      "/api/jobs/:id",
      async (
        request: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply,
      ) => {
        try {
          const { id } = request.params;
          const job = await this.pipeline.getJob(id);

          if (!job) {
            return reply.status(404).send({ error: "Job not found" });
          }

          // Job is already in public format, no serialization needed
          return reply.send(job);
        } catch (error) {
          logger.error(`API: Failed to get job ${request.params.id}: ${error}`);
          return reply.status(500).send({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );

    // Cancel specific job
    server.delete<{ Params: { id: string } }>(
      "/api/jobs/:id",
      async (
        request: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply,
      ) => {
        try {
          const { id } = request.params;
          await this.pipeline.cancelJob(id);

          logger.debug(`API: Cancelled job ${id}`);

          return reply.send({ success: true });
        } catch (error) {
          logger.error(`API: Failed to cancel job ${request.params.id}: ${error}`);
          return reply.status(500).send({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );

    // Clear completed jobs
    server.delete<{ Reply: ClearJobsResponse }>(
      "/api/jobs",
      async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
          const count = await this.pipeline.clearCompletedJobs();

          logger.debug(`API: Cleared ${count} completed jobs`);

          return reply.send({ count });
        } catch (error) {
          logger.error(`API: Failed to clear completed jobs: ${error}`);
          return reply.status(500).send({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );

    logger.debug("Pipeline API routes registered");
  }
}
