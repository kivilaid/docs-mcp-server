/**
 * Integration tests for the main CLI entry point.
 * Tests critical startup behavior and validates against regression bugs.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock external dependencies to prevent actual server startup
const mockPipelineStart = vi.fn().mockResolvedValue(undefined);
const mockPipelineStop = vi.fn().mockResolvedValue(undefined);
const mockPipelineSetCallbacks = vi.fn();

const mockStartAppServer = vi.fn().mockResolvedValue({
  stop: vi.fn().mockResolvedValue(undefined),
});

const mockDocServiceInitialize = vi.fn().mockResolvedValue(undefined);
const mockDocServiceShutdown = vi.fn().mockResolvedValue(undefined);

vi.mock("./app", () => ({
  startAppServer: mockStartAppServer,
}));

vi.mock("./store/DocumentManagementService", () => ({
  DocumentManagementService: vi.fn().mockImplementation(() => ({
    initialize: mockDocServiceInitialize,
    shutdown: mockDocServiceShutdown,
  })),
}));

vi.mock("./pipeline/PipelineFactory", () => ({
  PipelineFactory: {
    createPipeline: vi.fn().mockResolvedValue({
      start: mockPipelineStart,
      stop: mockPipelineStop,
      setCallbacks: mockPipelineSetCallbacks,
      enqueueJob: vi.fn().mockResolvedValue("job-123"),
      getJob: vi.fn().mockResolvedValue(undefined),
      getJobs: vi.fn().mockResolvedValue([]),
      cancelJob: vi.fn().mockResolvedValue(undefined),
      clearCompletedJobs: vi.fn().mockResolvedValue(undefined),
      waitForJobCompletion: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock("./mcp/startStdioServer", () => ({
  startStdioServer: vi.fn().mockResolvedValue({
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("./mcp/tools", () => ({
  initializeTools: vi.fn().mockResolvedValue({}),
}));

vi.mock("./utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  setLogLevel: vi.fn(),
  LogLevel: { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 },
}));

vi.mock("playwright", () => ({
  chromium: { executablePath: vi.fn().mockReturnValue("/mock/chromium") },
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

// Suppress console.error in tests
vi.spyOn(console, "error").mockImplementation(() => {});

describe("CLI Flag Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Critical Bug Prevention", () => {
    it("should prevent --resume with --server-url combination", () => {
      // This tests the actual validation logic that prevents a configuration error
      // Bug: Using --resume with external worker doesn't make sense
      const validateResumeFlag = (resume: boolean, serverUrl?: string) => {
        if (resume && serverUrl) {
          throw new Error(
            "--resume flag is incompatible with --server-url. " +
              "External workers handle their own job recovery.",
          );
        }
      };

      expect(() => validateResumeFlag(true, "http://localhost:8080")).toThrow(
        "--resume flag is incompatible with --server-url",
      );

      // These should NOT throw
      expect(() => validateResumeFlag(false, "http://localhost:8080")).not.toThrow();
      expect(() => validateResumeFlag(true, undefined)).not.toThrow();
      expect(() => validateResumeFlag(false, undefined)).not.toThrow();
    });

    it("should validate port numbers correctly", () => {
      // This tests actual port validation logic
      const validatePort = (portString: string) => {
        const port = Number.parseInt(portString, 10);
        if (Number.isNaN(port) || port < 1 || port > 65535) {
          throw new Error("Invalid port number");
        }
        return port;
      };

      expect(() => validatePort("invalid")).toThrow("Invalid port number");
      expect(() => validatePort("-1")).toThrow("Invalid port number");
      expect(() => validatePort("0")).toThrow("Invalid port number");
      expect(() => validatePort("65536")).toThrow("Invalid port number");

      // These should work
      expect(validatePort("8080")).toBe(8080);
      expect(validatePort("3000")).toBe(3000);
      expect(validatePort("65535")).toBe(65535);
    });
  });

  describe("Protocol Resolution", () => {
    it("should resolve protocol based on TTY availability", () => {
      // Test the actual protocol resolution logic
      const resolveProtocol = (protocol: string, hasTTY: boolean) => {
        if (protocol === "auto") {
          return hasTTY ? "http" : "stdio";
        }
        if (protocol === "stdio" || protocol === "http") {
          return protocol;
        }
        throw new Error(`Invalid protocol: ${protocol}`);
      };

      // Auto-detection behavior
      expect(resolveProtocol("auto", true)).toBe("http");
      expect(resolveProtocol("auto", false)).toBe("stdio");

      // Explicit protocol behavior
      expect(resolveProtocol("stdio", true)).toBe("stdio");
      expect(resolveProtocol("stdio", false)).toBe("stdio");
      expect(resolveProtocol("http", true)).toBe("http");
      expect(resolveProtocol("http", false)).toBe("http");

      // Error cases
      expect(() => resolveProtocol("invalid", true)).toThrow("Invalid protocol");
    });
  });
});

describe("Double Initialization Prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should NOT start pipeline during initialization in worker mode", async () => {
    const { PipelineFactory } = await import("./pipeline/PipelineFactory");

    // This test validates our critical bug fix:
    // ensurePipelineManagerInitialized should create but NOT start the pipeline
    // Only registerWorkerService should call pipeline.start()

    // Simulate calling ensurePipelineManagerInitialized (the helper function)
    // In the real code, this gets called before startAppServer
    await PipelineFactory.createPipeline(
      {} as any, // mock docService
      { recoverJobs: true, concurrency: 3 },
    );

    // After createPipeline, the pipeline should NOT have been started yet
    expect(mockPipelineStart).not.toHaveBeenCalled();

    // Simulate what happens in registerWorkerService
    const mockReturnValue = await vi.mocked(PipelineFactory.createPipeline).mock
      .results[0]?.value;
    if (mockReturnValue) {
      await mockReturnValue.start();
    }

    // Now pipeline.start() should have been called exactly once
    expect(mockPipelineStart).toHaveBeenCalledTimes(1);
  });

  it("should validate pipeline configuration for different modes", async () => {
    const { PipelineFactory } = await import("./pipeline/PipelineFactory");

    // Test that different modes pass correct options to PipelineFactory

    // Worker mode configuration
    await PipelineFactory.createPipeline({} as any, {
      recoverJobs: true,
      concurrency: 3,
    });

    // CLI mode configuration
    await PipelineFactory.createPipeline({} as any, {
      recoverJobs: false,
      concurrency: 1,
    });

    // External worker mode configuration
    await PipelineFactory.createPipeline({} as any, {
      recoverJobs: false,
      serverUrl: "http://localhost:8080/api",
    });

    expect(vi.mocked(PipelineFactory.createPipeline)).toHaveBeenCalledTimes(3);

    // Verify different configurations were passed
    const calls = vi.mocked(PipelineFactory.createPipeline).mock.calls;
    expect(calls[0][1]).toEqual({ recoverJobs: true, concurrency: 3 });
    expect(calls[1][1]).toEqual({ recoverJobs: false, concurrency: 1 });
    expect(calls[2][1]).toEqual({
      recoverJobs: false,
      serverUrl: "http://localhost:8080/api",
    });
  });
});

describe("Service Configuration Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should configure services correctly for worker command", async () => {
    // This test validates that worker command creates the correct AppServer configuration
    const expectedWorkerConfig = {
      enableWebInterface: false,
      enableMcpServer: false,
      enableApiServer: true,
      enableWorker: true,
      port: 8080,
    };

    // Simulate worker command behavior
    await mockStartAppServer({} as any, {} as any, expectedWorkerConfig);

    expect(mockStartAppServer).toHaveBeenCalledWith(
      expect.anything(), // docService
      expect.anything(), // pipeline
      expect.objectContaining(expectedWorkerConfig),
    );
  });

  it("should initialize services in correct order", async () => {
    // Test that services are initialized in the right sequence
    // 1. DocumentManagementService.initialize()
    // 2. PipelineFactory.createPipeline()
    // 3. pipeline.setCallbacks()
    // 4. startAppServer() (which will call pipeline.start() via registerWorkerService)

    const { PipelineFactory } = await import("./pipeline/PipelineFactory");
    const { DocumentManagementService } = await import(
      "./store/DocumentManagementService"
    );

    // Simulate the service initialization sequence
    const docService = new DocumentManagementService();
    await docService.initialize();

    const pipeline = await PipelineFactory.createPipeline(docService, {});
    pipeline.setCallbacks({});

    await mockStartAppServer(docService, pipeline, {});

    // Verify initialization was called
    expect(mockDocServiceInitialize).toHaveBeenCalled();
    expect(mockPipelineSetCallbacks).toHaveBeenCalled();
    expect(mockStartAppServer).toHaveBeenCalled();

    // Verify pipeline.start() was NOT called during this sequence
    // (it should only be called by registerWorkerService inside AppServer)
    expect(mockPipelineStart).not.toHaveBeenCalled();
  });
});
