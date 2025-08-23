/**
 * Session management utilities for different interface types.
 * Creates appropriate session context for CLI, MCP, Web, and Pipeline interfaces.
 */

import { randomUUID } from "node:crypto";
import packageJson from "../../package.json";
import { CLI_DEFAULTS } from "../cli/utils";
import type { SessionContext } from "./analytics";

/**
 * Get package version from package.json
 */
function getPackageVersion(): string {
  return packageJson.version || "unknown";
}

/**
 * Create session context for CLI command execution
 */
export function createCliSession(
  command?: string,
  options?: {
    authEnabled?: boolean;
    readOnly?: boolean;
  },
): SessionContext {
  return {
    sessionId: randomUUID(),
    interface: "cli",
    startTime: new Date(),
    version: getPackageVersion(),
    platform: process.platform,
    nodeVersion: process.version,
    command: command || "unknown",
    authEnabled: options?.authEnabled ?? false,
    readOnly: options?.readOnly ?? false,
    servicesEnabled: ["worker"], // CLI typically runs embedded worker
  };
}

/**
 * Create session context for MCP protocol sessions
 */
export function createMcpSession(options: {
  protocol?: "stdio" | "http";
  transport?: "sse" | "streamable";
  authEnabled?: boolean;
  readOnly?: boolean;
  servicesEnabled?: string[];
  sessionId?: string;
}): SessionContext {
  return {
    sessionId: options.sessionId || randomUUID(),
    interface: "mcp",
    startTime: new Date(),
    version: getPackageVersion(),
    platform: process.platform,
    nodeVersion: process.version,
    protocol: options.protocol || "stdio",
    transport: options.transport,
    authEnabled: options.authEnabled ?? false,
    readOnly: options.readOnly ?? false,
    servicesEnabled: options.servicesEnabled || ["mcp"],
  };
}

/**
 * Create session context for web request handling
 */
export function createWebSession(options?: {
  route?: string;
  authEnabled?: boolean;
  readOnly?: boolean;
  servicesEnabled?: string[];
}): SessionContext {
  return {
    sessionId: randomUUID(),
    interface: "web",
    startTime: new Date(),
    version: getPackageVersion(),
    platform: process.platform,
    nodeVersion: process.version,
    route: options?.route,
    authEnabled: options?.authEnabled ?? false,
    readOnly: options?.readOnly ?? false,
    servicesEnabled: options?.servicesEnabled || ["web", "api"],
  };
}

/**
 * Create session context for pipeline job processing
 */
export function createPipelineSession(options?: {
  jobId?: string;
  authEnabled?: boolean;
  readOnly?: boolean;
  servicesEnabled?: string[];
}): SessionContext {
  return {
    sessionId: options?.jobId || randomUUID(),
    interface: "pipeline",
    startTime: new Date(),
    version: getPackageVersion(),
    platform: process.platform,
    nodeVersion: process.version,
    authEnabled: options?.authEnabled ?? false,
    readOnly: options?.readOnly ?? false,
    servicesEnabled: options?.servicesEnabled || ["worker"],
  };
}

/**
 * Helper to determine telemetry configuration from app config and CLI flags
 */
export function shouldEnableTelemetry(
  config?: {
    telemetry?: boolean;
  },
  globalOptions?: {
    noTelemetry?: boolean;
  },
): boolean {
  // CLI flag takes precedence
  if (globalOptions?.noTelemetry) {
    return false;
  }

  // Then app config
  if (config?.telemetry !== undefined) {
    return config.telemetry;
  }

  // Default from CLI_DEFAULTS
  return CLI_DEFAULTS.TELEMETRY;
}
