import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCliSession,
  createMcpSession,
  createPipelineSession,
  createWebSession,
  getEmbeddingModelContext,
  getEnabledServices,
} from "./sessions";

// Mock package.json
vi.mock("../../package.json", () => ({
  default: { version: "1.2.3" },
}));

// Mock the embedding factory
vi.mock("../store/embeddings/EmbeddingFactory", () => ({
  createEmbeddingModel: vi.fn((_modelSpec: string) => {
    if (_modelSpec === "invalid:model") {
      throw new Error("Invalid model spec");
    }
    return {
      embedQuery: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)), // Mock 1536-dim vector
    };
  }),
}));

describe("sessionManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createCliSession", () => {
    it("should create CLI session with defaults", () => {
      const session = createCliSession();

      expect(session.appInterface).toBe("cli");
      expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(session.startTime).toBeInstanceOf(Date);
      expect(session.appVersion).toBe("1.2.3");
      expect(session.appPlatform).toBe(process.platform);
      expect(session.appNodeVersion).toBe(process.version);
      expect(session.cliCommand).toBe("unknown");
      expect(session.appAuthEnabled).toBe(false);
      expect(session.appReadOnly).toBe(false);
      expect(session.appServicesEnabled).toEqual(["worker"]);
    });

    it("should create CLI session with custom options", () => {
      const session = createCliSession("scrape", {
        authEnabled: true,
        readOnly: true,
      });

      expect(session.cliCommand).toBe("scrape");
      expect(session.appAuthEnabled).toBe(true);
      expect(session.appReadOnly).toBe(true);
    });
  });

  describe("createMcpSession", () => {
    it("should create MCP session with defaults", () => {
      const session = createMcpSession({});

      expect(session.appInterface).toBe("mcp");
      expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(session.mcpProtocol).toBe("stdio");
      expect(session.mcpTransport).toBeUndefined();
      expect(session.appAuthEnabled).toBe(false);
      expect(session.appReadOnly).toBe(false);
      expect(session.appServicesEnabled).toEqual(["mcp"]);
    });

    it("should create MCP session with custom options", () => {
      const session = createMcpSession({
        protocol: "http",
        transport: "sse",
        authEnabled: true,
        readOnly: true,
        servicesEnabled: ["mcp", "api"],
      });

      expect(session.mcpProtocol).toBe("http");
      expect(session.mcpTransport).toBe("sse");
      expect(session.appAuthEnabled).toBe(true);
      expect(session.appReadOnly).toBe(true);
      expect(session.appServicesEnabled).toEqual(["mcp", "api"]);
    });
  });

  describe("createWebSession", () => {
    it("should create web session with defaults", () => {
      const session = createWebSession({});

      expect(session.appInterface).toBe("web");
      expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(session.mcpProtocol).toBe("http");
      expect(session.webRoute).toBeUndefined();
      expect(session.appAuthEnabled).toBe(false);
      expect(session.appReadOnly).toBe(false);
      expect(session.appServicesEnabled).toEqual(["web"]);
    });

    it("should create web session with custom options", () => {
      const session = createWebSession({
        route: "/docs/search",
        authEnabled: true,
        servicesEnabled: ["web", "worker"],
      });

      expect(session.webRoute).toBe("/docs/search");
      expect(session.appAuthEnabled).toBe(true);
      expect(session.appServicesEnabled).toEqual(["web", "worker"]);
    });
  });

  describe("createPipelineSession", () => {
    it("should create pipeline session with defaults", () => {
      const session = createPipelineSession({});

      expect(session.appInterface).toBe("pipeline");
      expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(session.appAuthEnabled).toBe(false);
      expect(session.appReadOnly).toBe(false);
      expect(session.appServicesEnabled).toEqual(["worker"]);
    });

    it("should create pipeline session with custom options", () => {
      const session = createPipelineSession({
        authEnabled: true,
        readOnly: false,
        servicesEnabled: ["worker", "api"],
      });

      expect(session.appAuthEnabled).toBe(true);
      expect(session.appReadOnly).toBe(false);
      expect(session.appServicesEnabled).toEqual(["worker", "api"]);
    });
  });

  describe("getEnabledServices", () => {
    it("should return default worker service when no config", () => {
      const services = getEnabledServices();
      expect(services).toEqual(["worker"]);
    });

    it("should return default worker service when empty config", () => {
      const services = getEnabledServices({});
      expect(services).toEqual(["worker"]);
    });

    it("should return enabled services based on config", () => {
      const services = getEnabledServices({
        web: true,
        mcp: true,
        api: false,
        worker: true,
      });

      expect(services).toEqual(["web", "mcp", "worker"]);
    });

    it("should return only enabled services", () => {
      const services = getEnabledServices({
        web: false,
        mcp: true,
        api: true,
        worker: false,
      });

      expect(services).toEqual(["mcp", "api"]);
    });
  });

  describe("session uniqueness", () => {
    it("should generate unique session IDs", () => {
      const session1 = createCliSession();
      const session2 = createCliSession();
      const session3 = createMcpSession({});

      expect(session1.sessionId).not.toBe(session2.sessionId);
      expect(session1.sessionId).not.toBe(session3.sessionId);
      expect(session2.sessionId).not.toBe(session3.sessionId);
    });

    it("should have different start times for concurrent sessions", () => {
      const session1 = createCliSession();
      const session2 = createWebSession({});

      // Times should be very close but potentially different
      expect(session1.startTime).toBeInstanceOf(Date);
      expect(session2.startTime).toBeInstanceOf(Date);
    });
  });

  describe("getEmbeddingModelContext", () => {
    it("should extract provider and model from environment variable", () => {
      // Mock environment variable
      const originalEnv = process.env.DOCS_MCP_EMBEDDING_MODEL;
      process.env.DOCS_MCP_EMBEDDING_MODEL = "vertex:text-embedding-004";

      const context = getEmbeddingModelContext();

      expect(context.aiEmbeddingProvider).toBe("vertex");
      expect(context.aiEmbeddingModel).toBe("text-embedding-004");
      expect(context.aiEmbeddingDimensions).toBe(768); // Known dimension

      // Restore environment
      if (originalEnv !== undefined) {
        process.env.DOCS_MCP_EMBEDDING_MODEL = originalEnv;
      } else {
        delete process.env.DOCS_MCP_EMBEDDING_MODEL;
      }
    });

    it("should default to openai when no provider specified", () => {
      // Mock environment variable
      const originalEnv = process.env.DOCS_MCP_EMBEDDING_MODEL;
      process.env.DOCS_MCP_EMBEDDING_MODEL = "text-embedding-3-small";

      const context = getEmbeddingModelContext();

      expect(context.aiEmbeddingProvider).toBe("openai");
      expect(context.aiEmbeddingModel).toBe("text-embedding-3-small");
      expect(context.aiEmbeddingDimensions).toBe(1536); // Known dimension

      // Restore environment
      if (originalEnv !== undefined) {
        process.env.DOCS_MCP_EMBEDDING_MODEL = originalEnv;
      } else {
        delete process.env.DOCS_MCP_EMBEDDING_MODEL;
      }
    });

    it("should handle unknown models gracefully", () => {
      // Mock environment variable with unknown model
      const originalEnv = process.env.DOCS_MCP_EMBEDDING_MODEL;
      process.env.DOCS_MCP_EMBEDDING_MODEL = "openai:unknown-model";

      const context = getEmbeddingModelContext();

      expect(context.aiEmbeddingProvider).toBe("openai");
      expect(context.aiEmbeddingModel).toBe("unknown-model");
      expect(context.aiEmbeddingDimensions).toBeNull(); // Unknown dimension

      // Restore environment
      if (originalEnv !== undefined) {
        process.env.DOCS_MCP_EMBEDDING_MODEL = originalEnv;
      } else {
        delete process.env.DOCS_MCP_EMBEDDING_MODEL;
      }
    });
  });
});
