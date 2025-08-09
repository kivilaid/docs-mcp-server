/**
 * tRPC router exposing pipeline procedures for external workers.
 * Provides a minimal RPC surface to replace legacy REST endpoints.
 */

import { initTRPC } from "@trpc/server";
import { z } from "zod";
import type { ScraperOptions } from "../../scraper/types";
import type { IPipeline } from "../interfaces";
import { PipelineJobStatus } from "../types";

// Context carries the pipeline instance
export interface PipelineTrpcContext {
  pipeline: IPipeline;
}

const t = initTRPC.context<PipelineTrpcContext>().create();

// Schemas
const nonEmptyTrimmed = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, "must not be empty");

const optionalTrimmed = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.string().min(1).optional().nullable(),
);

const enqueueInput = z.object({
  library: nonEmptyTrimmed,
  version: optionalTrimmed,
  options: z.custom<ScraperOptions>(),
});

const jobIdInput = z.object({ id: z.string().min(1) });

const getJobsInput = z.object({
  status: z.nativeEnum(PipelineJobStatus).optional(),
});

export const pipelineRouter = t.router({
  ping: t.procedure.query(async () => ({ status: "ok", ts: Date.now() })),

  enqueueJob: t.procedure.input(enqueueInput).mutation(async ({ ctx, input }) => {
    const jobId = await ctx.pipeline.enqueueJob(
      input.library,
      input.version ?? null,
      input.options,
    );
    return { jobId };
  }),

  getJob: t.procedure.input(jobIdInput).query(async ({ ctx, input }) => {
    return ctx.pipeline.getJob(input.id);
  }),

  getJobs: t.procedure.input(getJobsInput.optional()).query(async ({ ctx, input }) => {
    const jobs = await ctx.pipeline.getJobs(input?.status);
    return { jobs };
  }),

  cancelJob: t.procedure.input(jobIdInput).mutation(async ({ ctx, input }) => {
    await ctx.pipeline.cancelJob(input.id);
    return { success: true } as const;
  }),

  clearCompletedJobs: t.procedure.mutation(async ({ ctx }) => {
    const count = await ctx.pipeline.clearCompletedJobs();
    return { count };
  }),
});

export type PipelineRouter = typeof pipelineRouter;
