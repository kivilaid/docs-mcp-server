/**
 * Telemetry configuration management for enabling/disabling analytics collection.
 * Handles CLI flags, environment variables, and default settings.
 */

import { createHash } from "node:crypto";
import { arch, cpus, platform, totalmem } from "node:os";

export class TelemetryConfig {
  private static instance?: TelemetryConfig;
  private enabled: boolean;

  constructor() {
    this.enabled = this.determineEnabledState();
  }

  /**
   * Determines if telemetry should be enabled based on CLI flags and environment variables.
   * Priority: CLI flags > environment variables > default (true)
   */
  private determineEnabledState(): boolean {
    // Environment variable takes precedence
    if (process.env.DOCS_MCP_TELEMETRY === "false") {
      return false;
    }

    // Check for CLI flag (passed during initialization)
    const args = process.argv;
    if (args.includes("--no-telemetry")) {
      return false;
    }

    // Default to enabled for optional analytics
    return true;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  disable(): void {
    this.enabled = false;
  }

  enable(): void {
    this.enabled = true;
  }

  static getInstance(): TelemetryConfig {
    if (!TelemetryConfig.instance) {
      TelemetryConfig.instance = new TelemetryConfig();
    }
    return TelemetryConfig.instance;
  }
}

/**
 * Generate anonymous but persistent installation identifier based on system characteristics.
 * Not personally identifying but consistent across runs.
 */
export function generateInstallationId(): string {
  // Create hash from system info (not personally identifying)
  const systemInfo = [platform(), arch(), cpus().length, totalmem()].join("|");

  return createHash("sha256").update(systemInfo).digest("hex").substring(0, 16); // First 16 chars for brevity
}
