/**
 * Tests for telemetry configuration
 */

import { beforeEach, describe, expect, it } from "vitest";
import { TelemetryConfig } from "./telemetryConfig";

describe("TelemetryConfig", () => {
  beforeEach(() => {
    // Reset singleton instance for clean tests
    // @ts-expect-error - Accessing private static member for testing
    TelemetryConfig.instance = undefined;
    delete process.env.DOCS_MCP_TELEMETRY;
  });

  it("should default to enabled", () => {
    const config = new TelemetryConfig();
    expect(config.isEnabled()).toBe(true);
  });

  it("should respect environment variable", () => {
    process.env.DOCS_MCP_TELEMETRY = "false";
    const config = new TelemetryConfig();
    expect(config.isEnabled()).toBe(false);
  });

  it("should respect CLI flag in process.argv", () => {
    const originalArgv = process.argv;
    process.argv = ["node", "script.js", "--no-telemetry"];

    const config = new TelemetryConfig();
    expect(config.isEnabled()).toBe(false);

    process.argv = originalArgv;
  });

  it("should allow runtime enable/disable", () => {
    const config = new TelemetryConfig();
    expect(config.isEnabled()).toBe(true);

    config.disable();
    expect(config.isEnabled()).toBe(false);

    config.enable();
    expect(config.isEnabled()).toBe(true);
  });

  it("should maintain singleton behavior", () => {
    const config1 = TelemetryConfig.getInstance();
    const config2 = TelemetryConfig.getInstance();
    expect(config1).toBe(config2);
  });
});
