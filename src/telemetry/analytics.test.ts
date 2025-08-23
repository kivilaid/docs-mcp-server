import { beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics, analytics, TelemetryEvent, trackTool } from "./analytics";
import type { SessionContext } from "./SessionContext";

// Mock the config module
vi.mock("./TelemetryConfig", () => ({
  TelemetryConfig: {
    getInstance: vi.fn(() => ({
      isEnabled: vi.fn(() => true),
    })),
  },
  generateInstallationId: vi.fn(() => "test-installation-id"),
}));

// Mock the logger
vi.mock("../utils/logger", () => ({
  logger: {
    debug: vi.fn(),
  },
}));

// Mock PostHogClient
vi.mock("./postHogClient", () => ({
  PostHogClient: vi.fn().mockImplementation(() => ({
    capture: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    isEnabled: vi.fn(() => true),
  })),
}));

// Mock SessionTracker
vi.mock("./sessionTracker", () => ({
  SessionTracker: vi.fn().mockImplementation(() => ({
    startSession: vi.fn(),
    endSession: vi.fn(() => ({ duration: 5000, interface: "cli" })),
    getSessionContext: vi.fn(),
    getEnrichedProperties: vi.fn((props = {}) => ({
      sessionId: "test-session",
      interface: "cli",
      ...props,
      timestamp: "2025-08-23T10:00:05.000Z",
    })),
  })),
}));

const mockSessionContext: SessionContext = {
  sessionId: "test-session",
  interface: "cli",
  startTime: new Date("2025-08-23T10:00:00Z"),
  version: "1.0.0",
  platform: "linux",
  authEnabled: false,
  readOnly: false,
  servicesEnabled: [],
};

describe("Analytics", () => {
  let analytics: Analytics;
  let mockPostHogClient: any;
  let mockSessionTracker: any;

  beforeEach(() => {
    vi.clearAllMocks();
    analytics = new Analytics();

    // Get the mocked instances that were created in the constructor
    mockPostHogClient = (analytics as any).postHogClient;
    mockSessionTracker = (analytics as any).sessionTracker;
  });

  describe("constructor", () => {
    it("should initialize with PostHogClient and SessionTracker", () => {
      expect(analytics).toBeDefined();
      expect(analytics.isEnabled()).toBe(true);
    });

    it("should respect explicit enabled parameter", () => {
      const disabledAnalytics = new Analytics(false);
      expect(disabledAnalytics.isEnabled()).toBe(false);
    });
  });

  describe("session management", () => {
    it("should start session via SessionTracker", () => {
      analytics.startSession(mockSessionContext);

      expect(mockSessionTracker.startSession).toHaveBeenCalledWith(mockSessionContext);
      expect(mockPostHogClient.capture).toHaveBeenCalledWith(
        "test-installation-id",
        TelemetryEvent.SESSION_STARTED,
        {
          sessionId: "test-session",
          interface: "cli",
          timestamp: "2025-08-23T10:00:05.000Z",
          version: "1.0.0",
          platform: "linux",
          sessionDurationTarget: "short",
          authEnabled: false,
          readOnly: false,
          servicesCount: 0,
        },
      );
    });

    it("should end session via SessionTracker", () => {
      analytics.endSession();

      expect(mockSessionTracker.endSession).toHaveBeenCalled();
      expect(mockPostHogClient.capture).toHaveBeenCalledWith(
        "test-installation-id",
        TelemetryEvent.SESSION_ENDED,
        {
          sessionId: "test-session",
          interface: "cli",
          timestamp: "2025-08-23T10:00:05.000Z",
          durationMs: 5000,
        },
      );
    });

    it("should get session context from SessionTracker", () => {
      mockSessionTracker.getSessionContext.mockReturnValue(mockSessionContext);

      const context = analytics.getSessionContext();

      expect(mockSessionTracker.getSessionContext).toHaveBeenCalled();
      expect(context).toEqual(mockSessionContext);
    });
  });

  describe("event tracking", () => {
    it("should track events via PostHogClient", () => {
      analytics.track(TelemetryEvent.TOOL_USED, { tool: "test" });

      expect(mockSessionTracker.getEnrichedProperties).toHaveBeenCalledWith({
        tool: "test",
      });
      expect(mockPostHogClient.capture).toHaveBeenCalledWith(
        "test-installation-id",
        TelemetryEvent.TOOL_USED,
        {
          sessionId: "test-session",
          interface: "cli",
          timestamp: "2025-08-23T10:00:05.000Z",
          tool: "test",
        },
      );
    });
  });

  describe("shutdown", () => {
    it("should shutdown PostHogClient", async () => {
      await analytics.shutdown();

      expect(mockPostHogClient.shutdown).toHaveBeenCalled();
    });
  });

  describe("disabled analytics", () => {
    it("should not track when disabled", () => {
      const disabledAnalytics = new Analytics(false);

      disabledAnalytics.track(TelemetryEvent.TOOL_USED);

      expect(mockPostHogClient.capture).not.toHaveBeenCalled();
    });
  });
});

describe("trackTool", () => {
  it("should track successful tool usage", async () => {
    const mockOperation = vi.fn().mockResolvedValue("success");
    const mockGetProperties = vi.fn().mockReturnValue({ custom: "prop" });

    // Use vi.spyOn to spy on the global analytics.track method
    const trackSpy = vi.spyOn(analytics, "track");

    const result = await trackTool("test_tool", mockOperation, mockGetProperties);

    expect(result).toBe("success");
    expect(mockOperation).toHaveBeenCalled();
    expect(mockGetProperties).toHaveBeenCalledWith("success");
    expect(trackSpy).toHaveBeenCalledWith(
      TelemetryEvent.TOOL_USED,
      expect.objectContaining({
        tool: "test_tool",
        success: true,
        custom: "prop",
        durationMs: expect.any(Number),
      }),
    );
  });

  it("should track failed tool usage", async () => {
    const mockOperation = vi.fn().mockRejectedValue(new Error("Test error"));

    // Use vi.spyOn to spy on the global analytics.track method
    const trackSpy = vi.spyOn(analytics, "track");

    await expect(trackTool("test_tool", mockOperation)).rejects.toThrow("Test error");

    expect(trackSpy).toHaveBeenCalledWith(
      TelemetryEvent.TOOL_USED,
      expect.objectContaining({
        tool: "test_tool",
        success: false,
        errorType: "Error",
        durationMs: expect.any(Number),
      }),
    );
  });
});
