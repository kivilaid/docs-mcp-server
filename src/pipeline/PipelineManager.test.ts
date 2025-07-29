// Patch: Move UUID mock to top-level before imports
vi.mock("uuid", () => {
  let uuidCall = 0;
  const uuidSequence = [
    "mock-uuid-1",
    "mock-uuid-2",
    "mock-uuid-3",
    "mock-uuid-4",
    "mock-uuid-5",
    "mock-uuid-6",
  ];
  return {
    v4: () => uuidSequence[uuidCall++ % uuidSequence.length],
  };
});

import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScraperService } from "../scraper";
import type { DocumentManagementService } from "../store/DocumentManagementService";
import { PipelineManager } from "./PipelineManager";
import { PipelineWorker } from "./PipelineWorker";
import type { PipelineManagerCallbacks } from "./types";
import { PipelineJobStatus } from "./types";

// Mock dependencies
vi.mock("../store/DocumentManagementService");
vi.mock("../scraper/ScraperService");
vi.mock("./PipelineWorker");
vi.mock("../utils/logger");

describe("PipelineManager", () => {
  let mockStore: Partial<DocumentManagementService>;
  let mockWorkerInstance: { executeJob: Mock };
  let manager: PipelineManager;
  let mockCallbacks: PipelineManagerCallbacks;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers(); // Use fake timers for controlling async queue processing

    mockStore = {
      // Add mock methods if manager interacts directly (it shouldn't now)
    };

    // Mock the worker's executeJob method
    mockWorkerInstance = {
      executeJob: vi.fn().mockResolvedValue(undefined), // Default success
    };
    // Mock the constructor of PipelineWorker to return our mock instance
    (PipelineWorker as Mock).mockImplementation(() => mockWorkerInstance);

    mockCallbacks = {
      onJobStatusChange: vi.fn().mockResolvedValue(undefined),
      onJobProgress: vi.fn().mockResolvedValue(undefined),
      onJobError: vi.fn().mockResolvedValue(undefined),
    };

    // Default concurrency of 1 for simpler testing unless overridden
    manager = new PipelineManager(
      mockStore as DocumentManagementService,
      1, // Default to 1 for easier sequential testing
    );
    manager.setCallbacks(mockCallbacks);
  });

  afterEach(() => {
    vi.useRealTimers(); // Restore real timers
  });

  // --- Enqueueing Tests ---
  it("should enqueue a job with QUEUED status and return a job ID", async () => {
    const options = { url: "http://a.com", library: "libA", version: "1.0" };
    const jobId = await manager.enqueueJob("libA", "1.0", options);
    const job = await manager.getJob(jobId);
    expect(job?.status).toBe(PipelineJobStatus.QUEUED);
    expect(job?.library).toBe("libA");
    expect(job?.options.url).toBe("http://a.com");
    expect(mockCallbacks.onJobStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: jobId, status: PipelineJobStatus.QUEUED }),
    );
  });

  it("should start a queued job and transition to RUNNING", async () => {
    // Simulate a long-running job
    const pendingPromise = new Promise(() => {});
    mockWorkerInstance.executeJob.mockReturnValue(pendingPromise);
    const options = {
      url: "http://a.com",
      library: "libA",
      version: "1.0",
      maxPages: 1,
      maxDepth: 1,
    };
    const jobId = await manager.enqueueJob("libA", "1.0", options);
    await manager.start();
    await vi.advanceTimersByTimeAsync(1);
    const job = await manager.getJob(jobId);
    expect(job?.status).toBe(PipelineJobStatus.RUNNING);
    expect(PipelineWorker).toHaveBeenCalledOnce();
    expect(mockWorkerInstance.executeJob).toHaveBeenCalledOnce();
  });

  it("should complete a job and transition to COMPLETED", async () => {
    const options = { url: "http://a.com", library: "libA", version: "1.0" };
    const jobId = await manager.enqueueJob("libA", "1.0", options);
    await manager.start();
    await vi.advanceTimersByTimeAsync(1);
    await manager.waitForJobCompletion(jobId);
    const job = await manager.getJob(jobId);
    expect(job?.status).toBe(PipelineJobStatus.COMPLETED);
    expect(job?.finishedAt).toBeInstanceOf(Date);
  });

  it.each([
    ["queued", PipelineJobStatus.QUEUED],
    ["running", PipelineJobStatus.RUNNING],
    ["unversioned", PipelineJobStatus.QUEUED],
  ])(
    "should abort existing %s job for same library+version before enqueuing new job",
    async (desc, initialStatus) => {
      const options1 = {
        url: "http://a.com",
        library: "libA",
        version: desc === "unversioned" ? "" : "1.0",
      };
      let resolveJob: (() => void) | undefined;
      if (initialStatus === PipelineJobStatus.RUNNING) {
        mockWorkerInstance.executeJob.mockReturnValue(
          new Promise<void>((r) => {
            resolveJob = () => r();
          }),
        );
      }
      const jobId1 = await manager.enqueueJob(
        "libA",
        desc === "unversioned" ? undefined : "1.0",
        options1,
      );
      if (initialStatus === PipelineJobStatus.RUNNING) {
        await manager.start();
        await vi.advanceTimersByTimeAsync(1);
      }
      const cancelSpy = vi.spyOn(manager, "cancelJob");
      const options2 = {
        url: "http://b.com",
        library: "libA",
        version: desc === "unversioned" ? "" : "1.0",
      };
      const jobId2 = await manager.enqueueJob(
        "libA",
        desc === "unversioned" ? undefined : "1.0",
        options2,
      );
      // Now wait for cancellation to propagate
      if (resolveJob) resolveJob();
      await manager.waitForJobCompletion(jobId1).catch(() => {});
      const job1 = await manager.getJob(jobId1);
      expect(cancelSpy).toHaveBeenCalledWith(jobId1);
      expect(jobId2).not.toBe(jobId1);
      expect(job1?.status).toBe(PipelineJobStatus.CANCELLED);
      const job2 = await manager.getJob(jobId2);
      expect([
        PipelineJobStatus.QUEUED,
        PipelineJobStatus.RUNNING,
        PipelineJobStatus.COMPLETED,
      ]).toContain(job2?.status);
    },
  );

  it("should transition job to FAILED if worker throws", async () => {
    mockWorkerInstance.executeJob.mockRejectedValue(new Error("fail"));
    const options = { url: "http://fail.com", library: "libFail", version: "1.0" };
    const jobId = await manager.enqueueJob("libFail", "1.0", options);
    const job = await manager.getJob(jobId);
    job?.completionPromise.catch(() => {}); // Attach handler immediately after job creation
    await manager.start();
    await vi.advanceTimersByTimeAsync(1);
    await manager.waitForJobCompletion(jobId).catch(() => {});
    const jobAfter = await manager.getJob(jobId);
    expect(jobAfter?.status).toBe(PipelineJobStatus.FAILED);
    expect(jobAfter?.error).toBeInstanceOf(Error);
  });

  it("should cancel a job via cancelJob API", async () => {
    let resolveJob: () => void = () => {};
    mockWorkerInstance.executeJob.mockReturnValue(
      new Promise<void>((r) => {
        resolveJob = () => r();
      }),
    );
    const options = { url: "http://cancel.com", library: "libCancel", version: "1.0" };
    const jobId = await manager.enqueueJob("libCancel", "1.0", options);
    await manager.start();
    await vi.advanceTimersByTimeAsync(1);
    await manager.cancelJob(jobId);
    resolveJob();
    await manager.waitForJobCompletion(jobId).catch(() => {});
    const job = await manager.getJob(jobId);
    expect(job?.status).toBe(PipelineJobStatus.CANCELLED);
  });

  it("should call onJobProgress callback during job execution", async () => {
    mockWorkerInstance.executeJob.mockImplementation(async (job, callbacks) => {
      await callbacks.onJobProgress?.(job, {
        pagesScraped: 1,
        maxPages: 1,
        currentUrl: "url",
        depth: 1,
        maxDepth: 1,
        document: undefined,
      });
    });
    const options = {
      url: "http://progress.com",
      library: "libProgress",
      version: "1.0",
    };
    const jobId = await manager.enqueueJob("libProgress", "1.0", options);
    await manager.start();
    await vi.advanceTimersByTimeAsync(1);
    await manager.waitForJobCompletion(jobId);
    expect(mockCallbacks.onJobProgress).toHaveBeenCalled();
  });

  it("should run jobs in parallel if concurrency > 1", async () => {
    manager = new PipelineManager(mockStore as DocumentManagementService, 2);
    manager.setCallbacks(mockCallbacks);
    const optionsA = { url: "http://a.com", library: "libA", version: "1.0" };
    const optionsB = { url: "http://b.com", library: "libB", version: "1.0" };
    const pendingPromise = new Promise(() => {});
    mockWorkerInstance.executeJob.mockReturnValue(pendingPromise);
    const jobIdA = await manager.enqueueJob("libA", "1.0", optionsA);
    const jobIdB = await manager.enqueueJob("libB", "1.0", optionsB);
    await manager.start();
    await vi.advanceTimersByTimeAsync(1);
    const jobA = await manager.getJob(jobIdA);
    const jobB = await manager.getJob(jobIdB);
    expect(jobA?.status).toBe(PipelineJobStatus.RUNNING);
    expect(jobB?.status).toBe(PipelineJobStatus.RUNNING);
  });
});
