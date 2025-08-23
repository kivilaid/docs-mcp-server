/**
 * Web service that registers all web interface routes for human interaction.
 * Extracted from src/web/web.ts to enable modular server composition.
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { IPipeline } from "../pipeline/trpc/interfaces";
import type { IDocumentManagement } from "../store/trpc/interfaces";
import { analytics, createWebSession, TelemetryEvent } from "../telemetry";
import { categorizeUserAgent, extractDomain } from "../telemetry/dataSanitizer";
import { SearchTool } from "../tools";

// Extend FastifyRequest to include telemetry timing
interface TelemetryRequest extends FastifyRequest {
  telemetryStartTime?: number;
}

import { CancelJobTool } from "../tools/CancelJobTool";
import { ClearCompletedJobsTool } from "../tools/ClearCompletedJobsTool";
import { ListJobsTool } from "../tools/ListJobsTool";
import { ListLibrariesTool } from "../tools/ListLibrariesTool";
import { RemoveTool } from "../tools/RemoveTool";
import { ScrapeTool } from "../tools/ScrapeTool";
import { registerIndexRoute } from "../web/routes/index";
import { registerCancelJobRoute } from "../web/routes/jobs/cancel";
import { registerClearCompletedJobsRoute } from "../web/routes/jobs/clear-completed";
import { registerJobListRoutes } from "../web/routes/jobs/list";
import { registerNewJobRoutes } from "../web/routes/jobs/new";
import { registerLibraryDetailRoutes } from "../web/routes/libraries/detail";
import { registerLibrariesRoutes } from "../web/routes/libraries/list";

/**
 * Register web interface routes on a Fastify server instance.
 * This includes all human-facing UI routes.
 * Note: Static file serving and form body parsing are handled by AppServer.
 */
export async function registerWebService(
  server: FastifyInstance,
  docService: IDocumentManagement,
  pipeline: IPipeline,
): Promise<void> {
  // Add telemetry middleware for web requests
  if (analytics.isEnabled()) {
    server.addHook("onRequest", async (request) => {
      // Create a web session for this request
      const sessionContext = createWebSession({
        route: request.url,
      });

      // Set session context for this request
      analytics.startSession(sessionContext);

      // Store request start time for duration tracking
      (request as TelemetryRequest).telemetryStartTime = performance.now();
    });

    server.addHook("onResponse", async (request, reply) => {
      const telemetryRequest = request as TelemetryRequest;
      if (telemetryRequest.telemetryStartTime) {
        const duration = performance.now() - telemetryRequest.telemetryStartTime;

        // Track web request completion
        analytics.track(TelemetryEvent.HTTP_REQUEST_COMPLETED, {
          method: request.method,
          route: request.routeOptions?.url || request.url,
          status_code: reply.statusCode,
          duration_ms: Math.round(duration),
          domain: extractDomain(request.hostname || "localhost"),
          user_agent_category: categorizeUserAgent(request.headers["user-agent"] || ""),
        });

        // End session
        analytics.endSession();
      }
    });
  }
  // Instantiate tools for web routes
  const listLibrariesTool = new ListLibrariesTool(docService);
  const listJobsTool = new ListJobsTool(pipeline);
  const scrapeTool = new ScrapeTool(pipeline);
  const removeTool = new RemoveTool(docService, pipeline);
  const searchTool = new SearchTool(docService);
  const cancelJobTool = new CancelJobTool(pipeline);
  const clearCompletedJobsTool = new ClearCompletedJobsTool(pipeline);

  // Register all web routes
  registerIndexRoute(server);
  registerLibrariesRoutes(server, listLibrariesTool, removeTool);
  registerLibraryDetailRoutes(server, listLibrariesTool, searchTool);
  registerJobListRoutes(server, listJobsTool);
  registerNewJobRoutes(server, scrapeTool);
  registerCancelJobRoute(server, cancelJobTool);
  registerClearCompletedJobsRoute(server, clearCompletedJobsTool);
}
