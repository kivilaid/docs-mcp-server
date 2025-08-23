import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "./SessionContext";
import { createTelemetryService, telemetryService } from "./TelemetryService";

// Mock analytics module
vi.mock("./analytics.js", () => ({
  analytics: {
    startSession: vi.fn(),
    endSession: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  },
}));

import { analytics } from "./analytics";

describe("TelemetryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createTelemetryService", () => {
    it("should create a service with all required methods", () => {
      const service = createTelemetryService();

      expect(service).toHaveProperty("startSession");
      expect(service).toHaveProperty("endSession");
      expect(service).toHaveProperty("shutdown");
      expect(typeof service.startSession).toBe("function");
      expect(typeof service.endSession).toBe("function");
      expect(typeof service.shutdown).toBe("function");
    });

    it("should delegate startSession to analytics", () => {
      const service = createTelemetryService();
      const mockContext: SessionContext = {
        sessionId: "test-session",
        interface: "cli",
        startTime: new Date(),
        version: "1.0.0",
        platform: "linux",
        authEnabled: false,
        readOnly: false,
        servicesEnabled: ["worker"],
      };

      service.startSession(mockContext);

      expect(analytics.startSession).toHaveBeenCalledWith(mockContext);
      expect(analytics.startSession).toHaveBeenCalledTimes(1);
    });

    it("should delegate endSession to analytics", () => {
      const service = createTelemetryService();

      service.endSession();

      expect(analytics.endSession).toHaveBeenCalledWith();
      expect(analytics.endSession).toHaveBeenCalledTimes(1);
    });

    it("should delegate shutdown to analytics and return promise", async () => {
      const service = createTelemetryService();

      const result = service.shutdown();

      expect(result).toBeInstanceOf(Promise);
      await result;
      expect(analytics.shutdown).toHaveBeenCalledWith();
      expect(analytics.shutdown).toHaveBeenCalledTimes(1);
    });
  });

  describe("global telemetryService instance", () => {
    it("should export a global instance", () => {
      expect(telemetryService).toBeDefined();
      expect(telemetryService).toHaveProperty("startSession");
      expect(telemetryService).toHaveProperty("endSession");
      expect(telemetryService).toHaveProperty("shutdown");
    });

    it("should work with the global instance", () => {
      const mockContext: SessionContext = {
        sessionId: "global-test",
        interface: "mcp",
        startTime: new Date(),
        version: "1.0.0",
        platform: "darwin",
        authEnabled: true,
        readOnly: true,
        servicesEnabled: ["mcp", "web"],
      };

      telemetryService.startSession(mockContext);
      telemetryService.endSession();

      expect(analytics.startSession).toHaveBeenCalledWith(mockContext);
      expect(analytics.endSession).toHaveBeenCalled();
    });
  });
});
