import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IPipeline } from "./interfaces";
import { PipelineApiService } from "./PipelineApiService";

vi.mock("../utils/logger");

describe("PipelineApiService", () => {
  let service: PipelineApiService;
  let mockPipeline: Partial<IPipeline>;
  let mockServer: Partial<FastifyInstance>;
  let registeredRoutes: Map<string, any>;

  beforeEach(() => {
    vi.resetAllMocks();

    // Track registered routes
    registeredRoutes = new Map();

    mockPipeline = {
      enqueueJob: vi.fn().mockResolvedValue("job-123"),
      getJob: vi.fn(),
      getJobs: vi.fn().mockResolvedValue([]),
      cancelJob: vi.fn().mockResolvedValue(undefined),
      clearCompletedJobs: vi.fn().mockResolvedValue(5),
    };

    // Mock fastify server with route registration tracking
    mockServer = {
      get: vi.fn().mockImplementation((path, handler) => {
        registeredRoutes.set(`GET ${path}`, handler);
      }),
      post: vi.fn().mockImplementation((path, handler) => {
        registeredRoutes.set(`POST ${path}`, handler);
      }),
      delete: vi.fn().mockImplementation((path, handler) => {
        registeredRoutes.set(`DELETE ${path}`, handler);
      }),
    };

    service = new PipelineApiService(mockPipeline as IPipeline);
  });

  describe("registerRoutes", () => {
    it("should register all expected API endpoints", async () => {
      await service.registerRoutes(mockServer as FastifyInstance);

      // Verify all expected routes are registered
      expect(registeredRoutes.has("GET /api/health")).toBe(true);
      expect(registeredRoutes.has("GET /api/health/detailed")).toBe(true);
      expect(registeredRoutes.has("POST /api/jobs")).toBe(true);
      expect(registeredRoutes.has("GET /api/jobs")).toBe(true);
      expect(registeredRoutes.has("GET /api/jobs/:id")).toBe(true);
      expect(registeredRoutes.has("DELETE /api/jobs/:id")).toBe(true);
      expect(registeredRoutes.has("DELETE /api/jobs")).toBe(true);
    });
  });

  describe("API endpoints behavior", () => {
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await service.registerRoutes(mockServer as FastifyInstance);

      mockReply = {
        send: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      };
    });

    describe("POST /api/jobs", () => {
      it("should enqueue job and return jobId", async () => {
        mockRequest = {
          body: {
            library: "react",
            version: "18.0.0",
            options: { url: "https://react.dev" },
          },
        };

        const handler = registeredRoutes.get("POST /api/jobs");
        await handler(mockRequest, mockReply);

        expect(mockPipeline.enqueueJob).toHaveBeenCalledWith("react", "18.0.0", {
          url: "https://react.dev",
        });
        expect(mockReply.send).toHaveBeenCalledWith({ jobId: "job-123" });
      });

      it("should return 400 for missing required fields", async () => {
        mockRequest = { body: { library: "react" } }; // Missing options

        const handler = registeredRoutes.get("POST /api/jobs");
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: "Missing required fields: library, options",
        });
      });

      it("should return 500 when pipeline throws error", async () => {
        mockRequest = {
          body: {
            library: "react",
            options: { url: "https://react.dev" },
          },
        };

        (mockPipeline.enqueueJob as any).mockRejectedValueOnce(
          new Error("Pipeline failed"),
        );

        const handler = registeredRoutes.get("POST /api/jobs");
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: "Pipeline failed",
        });
      });
    });

    describe("GET /api/jobs/:id", () => {
      it("should return job when found", async () => {
        const mockJob = {
          id: "job-123",
          library: "react",
          status: "completed",
          error: null,
          abortController: new AbortController(), // Non-serializable
        };

        mockRequest = { params: { id: "job-123" } };
        (mockPipeline.getJob as any).mockResolvedValueOnce(mockJob);

        const handler = registeredRoutes.get("GET /api/jobs/:id");
        await handler(mockRequest, mockReply);

        // Should serialize job (removing non-serializable fields)
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "job-123",
            library: "react",
            status: "completed",
            error: null,
          }),
        );

        // Should not include abortController in serialized response
        const sentData = (mockReply.send as any).mock.calls[0][0];
        expect(sentData).not.toHaveProperty("abortController");
      });

      it("should return 404 when job not found", async () => {
        mockRequest = { params: { id: "non-existent" } };
        (mockPipeline.getJob as any).mockResolvedValueOnce(undefined);

        const handler = registeredRoutes.get("GET /api/jobs/:id");
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(404);
        expect(mockReply.send).toHaveBeenCalledWith({ error: "Job not found" });
      });
    });

    describe("DELETE /api/jobs", () => {
      it("should clear completed jobs and return count", async () => {
        mockRequest = {};

        const handler = registeredRoutes.get("DELETE /api/jobs");
        await handler(mockRequest, mockReply);

        expect(mockPipeline.clearCompletedJobs).toHaveBeenCalled();
        expect(mockReply.send).toHaveBeenCalledWith({ count: 5 });
      });
    });

    describe("GET /api/health", () => {
      it("should return health status", async () => {
        mockRequest = {};

        const handler = registeredRoutes.get("GET /api/health");
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          status: "ok",
          timestamp: expect.any(String),
        });
      });
    });
  });
});
