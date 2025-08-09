/**
 * Fastify service to register tRPC pipeline router at /trpc.
 */

import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import type { FastifyInstance } from "fastify";
import type { IPipeline } from "../pipeline/interfaces";
import { type PipelineTrpcContext, pipelineRouter } from "../pipeline/trpc/router";

export async function registerTrpcService(
  server: FastifyInstance,
  pipeline: IPipeline,
): Promise<void> {
  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: pipelineRouter,
      createContext: async (): Promise<PipelineTrpcContext> => ({ pipeline }),
    },
  });
}
