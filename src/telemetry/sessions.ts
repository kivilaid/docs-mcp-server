/**
 * Session management utilities for different interface types.
 * Creates appropriate session context for CLI, MCP, Web, and Pipeline interfaces.
 */

import { randomUUID } from "node:crypto";
import packageJson from "../../package.json";
import type { SessionContext } from "./SessionContext";

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
}): SessionContext {
  return {
    sessionId: randomUUID(),
    interface: "mcp",
    startTime: new Date(),
    version: getPackageVersion(),
    platform: process.platform,
    nodeVersion: process.version,
    protocol: options.protocol || "stdio",
    transport: options.transport,
    authEnabled: options.authEnabled ?? false,
    readOnly: options.readOnly ?? false,
    servicesEnabled: options.servicesEnabled ?? ["mcp"],
  };
}

/**
 * Create session context for web interface sessions
 */
export function createWebSession(options: {
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
    protocol: "http",
    route: options.route,
    authEnabled: options.authEnabled ?? false,
    readOnly: options.readOnly ?? false,
    servicesEnabled: options.servicesEnabled ?? ["web"],
  };
}

/**
 * Create session context for pipeline worker sessions
 */
export function createPipelineSession(options: {
  authEnabled?: boolean;
  readOnly?: boolean;
  servicesEnabled?: string[];
}): SessionContext {
  return {
    sessionId: randomUUID(),
    interface: "pipeline",
    startTime: new Date(),
    version: getPackageVersion(),
    platform: process.platform,
    nodeVersion: process.version,
    authEnabled: options.authEnabled ?? false,
    readOnly: options.readOnly ?? false,
    servicesEnabled: options.servicesEnabled ?? ["worker"],
  };
}

/**
 * Get enabled services from configuration
 */
export function getEnabledServices(config?: {
  web?: boolean;
  mcp?: boolean;
  api?: boolean;
  worker?: boolean;
}): string[] {
  const services: string[] = [];

  if (config?.web) services.push("web");
  if (config?.mcp) services.push("mcp");
  if (config?.api) services.push("api");
  if (config?.worker) services.push("worker");

  return services.length > 0 ? services : ["worker"]; // Default to worker
}
