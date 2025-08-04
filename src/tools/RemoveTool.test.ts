import type { MockedObject } from "vitest"; // Import MockedObject
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IPipeline } from "../pipeline/interfaces";
import type { DocumentManagementService } from "../store";
import { ToolError } from "./errors";
import { RemoveTool, type RemoveToolArgs } from "./RemoveTool";

// Mock dependencies
vi.mock("../store");
vi.mock("../utils/logger");

// Create a properly typed mock using MockedObject
const mockDocService = {
  removeAllDocuments: vi.fn(),
  // Add other methods used by DocumentManagementService if needed, mocking them with vi.fn()
} as MockedObject<DocumentManagementService>;

// Create pipeline mock
const mockPipeline = {
  getJobs: vi.fn(),
  cancelJob: vi.fn(),
  waitForJobCompletion: vi.fn(),
} as unknown as IPipeline;

describe("RemoveTool", () => {
  let removeTool: RemoveTool;

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks(); // Resets all mocks, including those on mockDocService
    removeTool = new RemoveTool(mockDocService, mockPipeline); // Pass both mocks
  });

  it("should call removeAllDocuments with library and version", async () => {
    const args: RemoveToolArgs = { library: "react", version: "18.2.0" };
    // Setup mocks
    mockDocService.removeAllDocuments.mockResolvedValue(undefined);
    (mockPipeline.getJobs as any).mockResolvedValue([]);

    const result = await removeTool.execute(args);

    expect(mockDocService.removeAllDocuments).toHaveBeenCalledTimes(1);
    expect(mockDocService.removeAllDocuments).toHaveBeenCalledWith("react", "18.2.0");
    expect(result).toEqual({
      message: "Successfully removed documents for react@18.2.0.",
    });
  });

  it("should call removeAllDocuments with library and undefined version for unversioned", async () => {
    const args: RemoveToolArgs = { library: "lodash" };
    // Setup mocks
    mockDocService.removeAllDocuments.mockResolvedValue(undefined);
    (mockPipeline.getJobs as any).mockResolvedValue([]);

    const result = await removeTool.execute(args);

    expect(mockDocService.removeAllDocuments).toHaveBeenCalledTimes(1);
    expect(mockDocService.removeAllDocuments).toHaveBeenCalledWith("lodash", undefined);
    expect(result).toEqual({
      message: "Successfully removed documents for lodash (unversioned).",
    });
  });

  it("should handle empty string version as unversioned", async () => {
    const args: RemoveToolArgs = { library: "moment", version: "" };
    // Setup mocks
    mockDocService.removeAllDocuments.mockResolvedValue(undefined);
    (mockPipeline.getJobs as any).mockResolvedValue([]);

    const result = await removeTool.execute(args);

    expect(mockDocService.removeAllDocuments).toHaveBeenCalledTimes(1);
    expect(mockDocService.removeAllDocuments).toHaveBeenCalledWith("moment", "");
    expect(result).toEqual({
      message: "Successfully removed documents for moment (unversioned).",
    });
  });

  it("should throw ToolError if removeAllDocuments fails", async () => {
    const args: RemoveToolArgs = { library: "vue", version: "3.0.0" };
    const testError = new Error("Database connection failed");
    // Setup mocks
    mockDocService.removeAllDocuments.mockRejectedValue(testError);
    (mockPipeline.getJobs as any).mockResolvedValue([]);

    // Use try-catch to ensure the mock call check happens even after rejection
    try {
      await removeTool.execute(args);
    } catch (e) {
      expect(e).toBeInstanceOf(ToolError);
      expect((e as ToolError).message).toContain(
        "Failed to remove documents for vue@3.0.0: Database connection failed",
      );
    }
    // Verify the call happened
    expect(mockDocService.removeAllDocuments).toHaveBeenCalledWith("vue", "3.0.0");
  });

  it("should throw ToolError with correct message for unversioned failure", async () => {
    const args: RemoveToolArgs = { library: "angular" };
    const testError = new Error("Filesystem error");
    // Setup mocks
    mockDocService.removeAllDocuments.mockRejectedValue(testError);
    (mockPipeline.getJobs as any).mockResolvedValue([]);

    // Use try-catch to ensure the mock call check happens even after rejection
    try {
      await removeTool.execute(args);
    } catch (e) {
      expect(e).toBeInstanceOf(ToolError);
      expect((e as ToolError).message).toContain(
        "Failed to remove documents for angular (unversioned): Filesystem error",
      );
    }
    // Verify the call happened
    expect(mockDocService.removeAllDocuments).toHaveBeenCalledWith("angular", undefined);
  });

  it("should abort and wait for QUEUED job for same library+version before deletion", async () => {
    // Mock pipeline with QUEUED job
    const mockLocalPipeline = {
      getJobs: vi
        .fn()
        .mockResolvedValue([
          { id: "job-1", library: "libX", version: "1.0.0", status: "queued" },
        ]),
      cancelJob: vi.fn().mockResolvedValue(undefined),
      waitForJobCompletion: vi.fn().mockResolvedValue(undefined),
    } as unknown as IPipeline;

    const removeToolWithPipeline = new RemoveTool(mockDocService, mockLocalPipeline);
    mockDocService.removeAllDocuments.mockResolvedValue(undefined);

    const args: RemoveToolArgs = { library: "libX", version: "1.0.0" };
    const result = await removeToolWithPipeline.execute(args);

    expect(mockLocalPipeline.getJobs).toHaveBeenCalled();
    expect(mockLocalPipeline.cancelJob).toHaveBeenCalledWith("job-1");
    expect(mockLocalPipeline.waitForJobCompletion).toHaveBeenCalledWith("job-1");
    expect(mockDocService.removeAllDocuments).toHaveBeenCalledWith("libX", "1.0.0");
    expect(result.message).toContain("Successfully removed documents for libX@1.0.0");
  });

  it("should abort and wait for RUNNING job for same library+version before deletion", async () => {
    const mockLocalPipeline = {
      getJobs: vi
        .fn()
        .mockResolvedValue([
          { id: "job-2", library: "libY", version: "2.0.0", status: "running" },
        ]),
      cancelJob: vi.fn().mockResolvedValue(undefined),
      waitForJobCompletion: vi.fn().mockResolvedValue(undefined),
    } as unknown as IPipeline;

    const removeToolWithPipeline = new RemoveTool(mockDocService, mockLocalPipeline);
    mockDocService.removeAllDocuments.mockResolvedValue(undefined);

    const args: RemoveToolArgs = { library: "libY", version: "2.0.0" };
    const result = await removeToolWithPipeline.execute(args);

    expect(mockLocalPipeline.getJobs).toHaveBeenCalled();
    expect(mockLocalPipeline.cancelJob).toHaveBeenCalledWith("job-2");
    expect(mockLocalPipeline.waitForJobCompletion).toHaveBeenCalledWith("job-2");
    expect(mockDocService.removeAllDocuments).toHaveBeenCalledWith("libY", "2.0.0");
    expect(result.message).toContain("Successfully removed documents for libY@2.0.0");
  });

  it("should abort and wait for jobs for unversioned (empty string) before deletion", async () => {
    const mockLocalPipeline = {
      getJobs: vi.fn().mockResolvedValue([
        { id: "job-3", library: "libZ", version: "", status: "queued" },
        { id: "job-4", library: "libZ", version: "", status: "running" },
      ]),
      cancelJob: vi.fn().mockResolvedValue(undefined),
      waitForJobCompletion: vi.fn().mockResolvedValue(undefined),
    } as unknown as IPipeline;

    const removeToolWithPipeline = new RemoveTool(mockDocService, mockLocalPipeline);
    mockDocService.removeAllDocuments.mockResolvedValue(undefined);

    const args: RemoveToolArgs = { library: "libZ", version: "" };
    const result = await removeToolWithPipeline.execute(args);

    expect(mockLocalPipeline.getJobs).toHaveBeenCalled();
    expect(mockLocalPipeline.cancelJob).toHaveBeenCalledWith("job-3");
    expect(mockLocalPipeline.cancelJob).toHaveBeenCalledWith("job-4");
    expect(mockLocalPipeline.waitForJobCompletion).toHaveBeenCalledWith("job-3");
    expect(mockLocalPipeline.waitForJobCompletion).toHaveBeenCalledWith("job-4");
    expect(mockDocService.removeAllDocuments).toHaveBeenCalledWith("libZ", "");
    expect(result.message).toContain(
      "Successfully removed documents for libZ (unversioned)",
    );
  });
});
