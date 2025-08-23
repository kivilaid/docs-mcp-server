/**
 * Tests for analytics wrapper
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics, trackTool } from "../utils/analytics";

// Mock PostHog
vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(() => ({
    capture: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe("Analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize when enabled", () => {
    const analytics = new Analytics(true);
    expect(analytics.isEnabled()).toBe(true);
  });

  it("should not initialize when disabled", () => {
    const analytics = new Analytics(false);
    expect(analytics.isEnabled()).toBe(false);
  });

  it("should track events with session context", () => {
    const analytics = new Analytics(true);

    const sessionContext = {
      sessionId: "test-session",
      interface: "cli" as const,
      startTime: new Date(),
      version: "1.0.0",
      platform: "test",
      authEnabled: false,
      readOnly: false,
      servicesEnabled: ["worker"],
    };

    analytics.startSession(sessionContext);
    analytics.track("test_event", { custom: "property" });

    // Session should be stored
    expect(analytics.getSessionContext()).toEqual(sessionContext);
  });

  it("should handle errors gracefully", () => {
    const analytics = new Analytics(false);

    // Should not throw when tracking events while disabled
    expect(() => {
      analytics.track("test_event");
      analytics.endSession();
    }).not.toThrow();
  });

  describe("trackTool", () => {
    it("should track successful tool execution", async () => {
      const mockOperation = vi.fn().mockResolvedValue({ count: 5 });
      const mockProperties = vi.fn().mockReturnValue({ resultCount: 5 });

      const result = await trackTool("TestTool", mockOperation, mockProperties);

      expect(result).toEqual({ count: 5 });
      expect(mockOperation).toHaveBeenCalled();
      expect(mockProperties).toHaveBeenCalledWith({ count: 5 });
    });

    it("should track failed tool execution", async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error("Test error"));

      await expect(trackTool("TestTool", mockOperation)).rejects.toThrow("Test error");
      expect(mockOperation).toHaveBeenCalled();
    });
  });
});
