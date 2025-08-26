import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCliSession,
  createMcpSession,
  createPipelineSession,
  createWebSession,
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

    it("should create CLI session with embedding context", () => {
      const embeddingContext = {
        aiEmbeddingProvider: "openai",
        aiEmbeddingModel: "text-embedding-3-small",
        aiEmbeddingDimensions: 1536,
      };

      const session = createCliSession("search", {
        authEnabled: false,
        readOnly: false,
        embeddingContext,
      });

      expect(session.cliCommand).toBe("search");
      expect(session.aiEmbeddingProvider).toBe("openai");
      expect(session.aiEmbeddingModel).toBe("text-embedding-3-small");
      expect(session.aiEmbeddingDimensions).toBe(1536);
    });

    it("should create CLI session without embedding context when null", () => {
      const session = createCliSession("fetch-url", {
        authEnabled: false,
        readOnly: false,
        embeddingContext: null,
      });

      expect(session.cliCommand).toBe("fetch-url");
      expect(session.aiEmbeddingProvider).toBeUndefined();
      expect(session.aiEmbeddingModel).toBeUndefined();
      expect(session.aiEmbeddingDimensions).toBeUndefined();
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

    it("should create MCP session with embedding context", () => {
      const embeddingContext = {
        aiEmbeddingProvider: "vertex",
        aiEmbeddingModel: "text-embedding-004",
        aiEmbeddingDimensions: 768,
      };

      const session = createMcpSession({
        protocol: "http",
        transport: "sse",
        authEnabled: false,
        readOnly: false,
        servicesEnabled: ["mcp"],
        embeddingContext,
      });

      expect(session.mcpProtocol).toBe("http");
      expect(session.aiEmbeddingProvider).toBe("vertex");
      expect(session.aiEmbeddingModel).toBe("text-embedding-004");
      expect(session.aiEmbeddingDimensions).toBe(768);
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
});
