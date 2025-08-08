import { beforeEach, describe, expect, it, vi } from "vitest";
import { PipelineClient } from "./PipelineClient";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("../utils/logger");

describe("PipelineClient", () => {
  let client: PipelineClient;
  const serverUrl = "http://localhost:8080/api";

  beforeEach(() => {
    vi.resetAllMocks();
    client = new PipelineClient(serverUrl);
  });

  describe("start", () => {
    it("should succeed when external worker is healthy", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await expect(client.start()).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:8080/api/health");
    });

    it("should fail when external worker is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      await expect(client.start()).rejects.toThrow(
        "Failed to connect to external worker",
      );
    });

    it("should fail when external worker returns non-ok status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(client.start()).rejects.toThrow("health check failed: 500");
    });
  });

  describe("enqueueJob", () => {
    it("should delegate job creation to external API", async () => {
      const mockJobId = "job-123";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobId: mockJobId }),
      });

      const jobId = await client.enqueueJob("react", "18.0.0", {
        url: "https://react.dev",
        library: "react",
        version: "18.0.0",
      });

      expect(jobId).toBe(mockJobId);
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:8080/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          library: "react",
          version: "18.0.0",
          options: {
            url: "https://react.dev",
            library: "react",
            version: "18.0.0",
          },
        }),
      });
    });

    it("should handle API errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad request",
      });

      await expect(client.enqueueJob("invalid", null, {} as any)).rejects.toThrow(
        "Failed to enqueue job: 400 Bad request",
      );
    });
  });

  describe("waitForJobCompletion", () => {
    it("should poll until job completes successfully", async () => {
      const jobId = "job-123";

      // Mock sequence: running -> running -> completed
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: "running" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: "running" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: "completed" }),
        });

      await expect(client.waitForJobCompletion(jobId)).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should throw error when job fails", async () => {
      const jobId = "job-123";
      const error = new Error("Scraping failed");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "failed", error }),
      });

      await expect(client.waitForJobCompletion(jobId)).rejects.toThrow(error);
    });

    it("should prevent concurrent polling for same job", async () => {
      const jobId = "job-123";

      // Start first polling (mock hanging response)
      mockFetch.mockImplementationOnce(
        () => new Promise(() => {}), // Never resolves
      );

      // Start first polling but don't await
      client.waitForJobCompletion(jobId);

      // Try to start second polling for same job
      await expect(client.waitForJobCompletion(jobId)).rejects.toThrow(
        "Already waiting for completion",
      );

      // Cleanup hanging promise
      await client.stop();
    });
  });

  describe("getJob", () => {
    it("should return undefined for non-existent job", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await client.getJob("non-existent");
      expect(result).toBeUndefined();
    });

    it("should return job data for existing job", async () => {
      const mockJob = {
        id: "job-123",
        status: "completed",
        createdAt: "2023-01-01T00:00:00.000Z",
        startedAt: null,
        finishedAt: null,
        updatedAt: undefined,
      };
      const expectedJob = {
        id: "job-123",
        status: "completed",
        createdAt: new Date("2023-01-01T00:00:00.000Z"),
        startedAt: null,
        finishedAt: null,
        updatedAt: undefined,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockJob,
      });

      const result = await client.getJob("job-123");
      expect(result).toEqual(expectedJob);
    });
  });
});
