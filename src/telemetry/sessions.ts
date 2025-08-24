/**
 * Session management utilities for different interface types.
 * Creates appropriate session context for CLI, MCP, Web, and Pipeline interfaces.
 */

import { randomUUID } from "node:crypto";
import packageJson from "../../package.json";
import type { EmbeddingContext } from "../cli/utils";
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
    embeddingContext?: EmbeddingContext | null;
  },
): SessionContext {
  const baseSession = {
    sessionId: randomUUID(),
    appInterface: "cli" as const,
    startTime: new Date(),
    appVersion: getPackageVersion(),
    appPlatform: process.platform,
    appNodeVersion: process.version,
    cliCommand: command || "unknown",
    appAuthEnabled: options?.authEnabled ?? false,
    appReadOnly: options?.readOnly ?? false,
    appServicesEnabled: ["worker"], // CLI typically runs embedded worker
  };

  // Include embedding context if provided
  if (options?.embeddingContext) {
    return {
      ...baseSession,
      ...options.embeddingContext,
    };
  }

  return baseSession;
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
  embeddingContext?: EmbeddingContext | null;
}): SessionContext {
  const baseSession = {
    sessionId: randomUUID(),
    appInterface: "mcp" as const,
    startTime: new Date(),
    appVersion: getPackageVersion(),
    appPlatform: process.platform,
    appNodeVersion: process.version,
    mcpProtocol: options.protocol || "stdio",
    mcpTransport: options.transport,
    appAuthEnabled: options.authEnabled ?? false,
    appReadOnly: options.readOnly ?? false,
    appServicesEnabled: options.servicesEnabled ?? ["mcp"],
  };

  // Include embedding context if provided
  if (options.embeddingContext) {
    return {
      ...baseSession,
      ...options.embeddingContext,
    };
  }

  return baseSession;
}

/**
 * Create session context for web interface sessions
 */
export function createWebSession(options: {
  route?: string;
  authEnabled?: boolean;
  readOnly?: boolean;
  servicesEnabled?: string[];
  embeddingContext?: EmbeddingContext | null;
}): SessionContext {
  const baseSession = {
    sessionId: randomUUID(),
    appInterface: "web" as const,
    startTime: new Date(),
    appVersion: getPackageVersion(),
    appPlatform: process.platform,
    appNodeVersion: process.version,
    mcpProtocol: "http" as const,
    webRoute: options.route,
    appAuthEnabled: options.authEnabled ?? false,
    appReadOnly: options.readOnly ?? false,
    appServicesEnabled: options.servicesEnabled ?? ["web"],
  };

  // Include embedding context if provided
  if (options.embeddingContext) {
    return {
      ...baseSession,
      ...options.embeddingContext,
    };
  }

  return baseSession;
}

/**
 * Create session context for pipeline worker sessions
 */
export function createPipelineSession(options: {
  authEnabled?: boolean;
  readOnly?: boolean;
  servicesEnabled?: string[];
  embeddingContext?: EmbeddingContext | null;
}): SessionContext {
  const baseSession = {
    sessionId: randomUUID(),
    appInterface: "pipeline" as const,
    startTime: new Date(),
    appVersion: getPackageVersion(),
    appPlatform: process.platform,
    appNodeVersion: process.version,
    appAuthEnabled: options.authEnabled ?? false,
    appReadOnly: options.readOnly ?? false,
    appServicesEnabled: options.servicesEnabled ?? ["worker"],
  };

  // Include embedding context if provided
  if (options.embeddingContext) {
    return {
      ...baseSession,
      ...options.embeddingContext,
    };
  }

  return baseSession;
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
