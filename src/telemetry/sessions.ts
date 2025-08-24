/**
 * Session management utilities for different interface types.
 * Creates appropriate session context for CLI, MCP, Web, and Pipeline interfaces.
 */

import { randomUUID } from "node:crypto";
import packageJson from "../../package.json";
import { parseEmbeddingConfig } from "../store/embeddings/EmbeddingConfig";
import { analytics } from "./analytics";
import type { SessionContext } from "./SessionContext";

/**
 * Get package version from package.json
 */
function getPackageVersion(): string {
  return packageJson.version || "unknown";
}

/**
 * Extract embedding model information from environment configuration.
 * Returns provider, model name, and dimensions for telemetry tracking.
 * This is now a synchronous operation that uses known dimensions lookup.
 */
export function getEmbeddingModelContext(): {
  aiEmbeddingProvider: string;
  aiEmbeddingModel: string;
  aiEmbeddingDimensions: number | null;
} {
  try {
    const config = parseEmbeddingConfig();

    return {
      aiEmbeddingProvider: config.provider,
      aiEmbeddingModel: config.model,
      aiEmbeddingDimensions: config.dimensions,
    };
  } catch (error) {
    // Fallback if config parsing fails
    console.warn("Failed to parse embedding config:", error);
    return {
      aiEmbeddingProvider: "unknown",
      aiEmbeddingModel: "unknown",
      aiEmbeddingDimensions: null,
    };
  }
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
  // Get embedding context synchronously
  const embeddingContext = getEmbeddingModelContext();

  return {
    sessionId: randomUUID(),
    appInterface: "cli",
    startTime: new Date(),
    appVersion: getPackageVersion(),
    appPlatform: process.platform,
    appNodeVersion: process.version,
    cliCommand: command || "unknown",
    appAuthEnabled: options?.authEnabled ?? false,
    appReadOnly: options?.readOnly ?? false,
    appServicesEnabled: ["worker"], // CLI typically runs embedded worker
    ...embeddingContext,
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
  // Get embedding context synchronously
  const embeddingContext = getEmbeddingModelContext();

  return {
    sessionId: randomUUID(),
    appInterface: "mcp",
    startTime: new Date(),
    appVersion: getPackageVersion(),
    appPlatform: process.platform,
    appNodeVersion: process.version,
    mcpProtocol: options.protocol || "stdio",
    mcpTransport: options.transport,
    appAuthEnabled: options.authEnabled ?? false,
    appReadOnly: options.readOnly ?? false,
    appServicesEnabled: options.servicesEnabled ?? ["mcp"],
    ...embeddingContext,
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
  // Get embedding context synchronously
  const embeddingContext = getEmbeddingModelContext();

  return {
    sessionId: randomUUID(),
    appInterface: "web",
    startTime: new Date(),
    appVersion: getPackageVersion(),
    appPlatform: process.platform,
    appNodeVersion: process.version,
    mcpProtocol: "http",
    webRoute: options.route,
    appAuthEnabled: options.authEnabled ?? false,
    appReadOnly: options.readOnly ?? false,
    appServicesEnabled: options.servicesEnabled ?? ["web"],
    ...embeddingContext,
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
  // Get embedding context synchronously
  const embeddingContext = getEmbeddingModelContext();

  return {
    sessionId: randomUUID(),
    appInterface: "pipeline",
    startTime: new Date(),
    appVersion: getPackageVersion(),
    appPlatform: process.platform,
    appNodeVersion: process.version,
    appAuthEnabled: options.authEnabled ?? false,
    appReadOnly: options.readOnly ?? false,
    appServicesEnabled: options.servicesEnabled ?? ["worker"],
    ...embeddingContext,
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

/**
 * Initialize embedding model context for an active session.
 * This should be called after session creation to populate embedding model info.
 * Now synchronous since we don't make expensive API calls.
 */
export function initializeEmbeddingContext(): void {
  const embeddingContext = getEmbeddingModelContext();
  if (embeddingContext.aiEmbeddingProvider || embeddingContext.aiEmbeddingModel) {
    analytics.updateSessionContext(embeddingContext);
  }
}
