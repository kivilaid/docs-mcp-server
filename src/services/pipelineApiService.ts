/**
 * Pipeline API service registration for modular server composition.
 * Wraps the existing PipelineApiService to provide a consistent function-based interface.
 */

import type { FastifyInstance } from "fastify";
import type { IPipeline } from "../pipeline/interfaces";
import { PipelineApiService } from "../pipeline/PipelineApiService";

/**
 * Register Pipeline API routes on a Fastify server instance.
 * This provides HTTP endpoints for job management and pipeline operations.
 */
export async function registerPipelineApiService(
  server: FastifyInstance,
  pipeline: IPipeline,
): Promise<void> {
  const pipelineApiService = new PipelineApiService(pipeline);
  await pipelineApiService.registerRoutes(server);
}
