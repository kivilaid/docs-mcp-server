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

describe("sessionManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createCliSession", () => {
    it("should create CLI session with defaults", () => {
      const session = createCliSession();

      expect(session.interface).toBe("cli");
      expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(session.startTime).toBeInstanceOf(Date);
      expect(session.version).toBe("1.2.3");
      expect(session.platform).toBe(process.platform);
      expect(session.nodeVersion).toBe(process.version);
      expect(session.command).toBe("unknown");
      expect(session.authEnabled).toBe(false);
      expect(session.readOnly).toBe(false);
      expect(session.servicesEnabled).toEqual(["worker"]);
    });

    it("should create CLI session with custom options", () => {
      const session = createCliSession("scrape", {
        authEnabled: true,
        readOnly: true,
      });

      expect(session.command).toBe("scrape");
      expect(session.authEnabled).toBe(true);
      expect(session.readOnly).toBe(true);
    });
  });

  describe("createMcpSession", () => {
    it("should create MCP session with defaults", () => {
      const session = createMcpSession({});

      expect(session.interface).toBe("mcp");
      expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(session.protocol).toBe("stdio");
      expect(session.transport).toBeUndefined();
      expect(session.authEnabled).toBe(false);
      expect(session.readOnly).toBe(false);
      expect(session.servicesEnabled).toEqual(["mcp"]);
    });

    it("should create MCP session with custom options", () => {
      const session = createMcpSession({
        protocol: "http",
        transport: "sse",
        authEnabled: true,
        readOnly: true,
        servicesEnabled: ["mcp", "api"],
      });

      expect(session.protocol).toBe("http");
      expect(session.transport).toBe("sse");
      expect(session.authEnabled).toBe(true);
      expect(session.readOnly).toBe(true);
      expect(session.servicesEnabled).toEqual(["mcp", "api"]);
    });
  });

  describe("createWebSession", () => {
    it("should create web session with defaults", () => {
      const session = createWebSession({});

      expect(session.interface).toBe("web");
      expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(session.protocol).toBe("http");
      expect(session.route).toBeUndefined();
      expect(session.authEnabled).toBe(false);
      expect(session.readOnly).toBe(false);
      expect(session.servicesEnabled).toEqual(["web"]);
    });

    it("should create web session with custom options", () => {
      const session = createWebSession({
        route: "/docs/search",
        authEnabled: true,
        servicesEnabled: ["web", "worker"],
      });

      expect(session.route).toBe("/docs/search");
      expect(session.authEnabled).toBe(true);
      expect(session.servicesEnabled).toEqual(["web", "worker"]);
    });
  });

  describe("createPipelineSession", () => {
    it("should create pipeline session with defaults", () => {
      const session = createPipelineSession({});

      expect(session.interface).toBe("pipeline");
      expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(session.authEnabled).toBe(false);
      expect(session.readOnly).toBe(false);
      expect(session.servicesEnabled).toEqual(["worker"]);
    });

    it("should create pipeline session with custom options", () => {
      const session = createPipelineSession({
        authEnabled: true,
        readOnly: false,
        servicesEnabled: ["worker", "api"],
      });

      expect(session.authEnabled).toBe(true);
      expect(session.readOnly).toBe(false);
      expect(session.servicesEnabled).toEqual(["worker", "api"]);
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
