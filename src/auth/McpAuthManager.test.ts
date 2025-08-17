/**
 * Unit tests for McpAuthManager.
 */

import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpAuthManager } from "./McpAuthManager";
import type { AuthConfig } from "./types";

// Mock the mcp-auth package
vi.mock("mcp-auth", () => ({
  fetchServerConfig: vi.fn(),
}));

describe("McpAuthManager", () => {
  let mockFastify: Partial<FastifyInstance>;
  let authConfig: AuthConfig;

  beforeEach(() => {
    mockFastify = {
      register: vi.fn(),
      addHook: vi.fn(),
    };

    authConfig = {
      enabled: true,
      providerUrl: "https://example.com/oauth2",
      resourceId: "https://api.example.com",
      scopes: ["read:docs"],
    };

    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create instance with valid config", () => {
      const manager = new McpAuthManager(authConfig);
      expect(manager).toBeInstanceOf(McpAuthManager);
    });

    it("should handle disabled auth config", () => {
      const disabledConfig: AuthConfig = {
        enabled: false,
        scopes: [],
      };
      const manager = new McpAuthManager(disabledConfig);
      expect(manager).toBeInstanceOf(McpAuthManager);
    });
  });

  describe("initialize", () => {
    it("should skip initialization when auth is disabled", async () => {
      const disabledConfig: AuthConfig = {
        enabled: false,
        scopes: [],
      };
      const manager = new McpAuthManager(disabledConfig);

      await manager.initialize();

      expect(mockFastify.register).not.toHaveBeenCalled();
    });

    it("should throw when enabled without required config", async () => {
      const incompleteConfig: AuthConfig = {
        enabled: true,
        scopes: ["read:docs"],
      };
      const manager = new McpAuthManager(incompleteConfig);

      await expect(manager.initialize()).rejects.toThrow(
        "Provider URL and Resource ID are required when auth is enabled",
      );
    });
  });

  describe("isEnabled", () => {
    it("should return true when auth is enabled", () => {
      const manager = new McpAuthManager(authConfig);
      expect(manager.isEnabled()).toBe(true);
    });

    it("should return false when auth is disabled", () => {
      const disabledConfig: AuthConfig = {
        enabled: false,
        scopes: [],
      };
      const manager = new McpAuthManager(disabledConfig);
      expect(manager.isEnabled()).toBe(false);
    });
  });

  describe("validateToken", () => {
    it("should return unauthenticated context when auth is disabled", async () => {
      const disabledConfig: AuthConfig = {
        enabled: false,
        scopes: ["read:docs"],
      };
      const manager = new McpAuthManager(disabledConfig);

      const result = await manager.validateToken("some-token");
      expect(result).toEqual({
        authenticated: false,
        scopes: new Set(["read:docs"]),
      });
    });

    it("should throw when auth is enabled but not initialized", async () => {
      const manager = new McpAuthManager(authConfig);

      await expect(manager.validateToken("Bearer some-token")).rejects.toThrow(
        "Auth manager not initialized",
      );
    });
  });

  describe("getProtectedResourceMetadata", () => {
    it("should return null before initialization", () => {
      const manager = new McpAuthManager(authConfig);

      const metadata = manager.getProtectedResourceMetadata();
      expect(metadata).toBeNull();
    });

    it("should return null when auth is disabled", () => {
      const disabledConfig: AuthConfig = {
        enabled: false,
        scopes: [],
      };
      const manager = new McpAuthManager(disabledConfig);

      const metadata = manager.getProtectedResourceMetadata();
      expect(metadata).toBeNull();
    });
  });
});
