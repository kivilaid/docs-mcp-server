/**
 * Session management utilities for different interface types.
 * Creates appropriate session context for CLI, MCP, Web, and Pipeline interfaces.
 */

import { randomUUID } from "node:crypto";
import packageJson from "../../package.json";
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
 */
export async function getEmbeddingModelContext(): Promise<{
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
}> {
  try {
    // Import dynamically to avoid circular dependencies
    const { createEmbeddingModel } = await import("../store/embeddings/EmbeddingFactory");

    const modelSpec = process.env.DOCS_MCP_EMBEDDING_MODEL || "text-embedding-3-small";

    // Parse provider and model from string (e.g., "gemini:embedding-001" or just "text-embedding-3-small")
    const [providerOrModel, modelName] = modelSpec.split(":");
    const provider = modelName ? providerOrModel : "openai"; // Default to openai if no provider specified
    const model = modelName || providerOrModel;

    // Create embedding model to get dimensions
    const embeddings = createEmbeddingModel(modelSpec);
    const testVector = await embeddings.embedQuery("test");
    const dimensions = testVector.length;

    return {
      embeddingProvider: provider,
      embeddingModel: model,
      embeddingDimensions: dimensions,
    };
  } catch (_error) {
    // Fallback if embedding model initialization fails
    return {
      embeddingProvider: "unknown",
      embeddingModel: "unknown",
      embeddingDimensions: 0,
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
    appInterface: "pipeline",
    startTime: new Date(),
    appVersion: getPackageVersion(),
    appPlatform: process.platform,
    appNodeVersion: process.version,
    appAuthEnabled: options.authEnabled ?? false,
    appReadOnly: options.readOnly ?? false,
    appServicesEnabled: options.servicesEnabled ?? ["worker"],
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
 * This should be called after session creation to populate embedding model info asynchronously.
 */
export async function initializeEmbeddingContext(): Promise<void> {
  const embeddingContext = await getEmbeddingModelContext();
  if (embeddingContext.embeddingProvider || embeddingContext.embeddingModel) {
    analytics.updateSessionContext({
      aiEmbeddingProvider: embeddingContext.embeddingProvider,
      aiEmbeddingModel: embeddingContext.embeddingModel,
      aiEmbeddingDimensions: embeddingContext.embeddingDimensions,
    });
  }
}
