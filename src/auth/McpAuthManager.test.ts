/**
 * Unit tests for McpAuthManager.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpAuthManager } from "./McpAuthManager";
import type { AuthConfig } from "./types";

// Mock fetch for OIDC discovery and JWT validation
global.fetch = vi.fn();

describe("McpAuthManager", () => {
  let authConfig: AuthConfig;

  beforeEach(() => {
    authConfig = {
      enabled: true,
      issuerUrl: "https://example.clerk.accounts.dev",
      audience: "https://docs-mcp-server.example.com",
      scopes: ["read:docs", "write:docs"],
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

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should throw when enabled without required config", async () => {
      const incompleteConfig: AuthConfig = {
        enabled: true,
        scopes: ["read:docs"],
      };
      const manager = new McpAuthManager(incompleteConfig);

      await expect(manager.initialize()).rejects.toThrow(
        "Issuer URL and Audience are required when auth is enabled",
      );
    });

    it("should perform OIDC discovery and initialize metadata", async () => {
      const mockOidcResponse = {
        issuer: "https://example.clerk.accounts.dev",
        authorization_endpoint: "https://example.clerk.accounts.dev/oauth/authorize",
        token_endpoint: "https://example.clerk.accounts.dev/oauth/token",
        jwks_uri: "https://example.clerk.accounts.dev/.well-known/jwks.json",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockOidcResponse,
      });

      const manager = new McpAuthManager(authConfig);
      await manager.initialize();

      expect(global.fetch).toHaveBeenCalledWith(
        "https://example.clerk.accounts.dev/.well-known/openid-configuration",
      );

      const metadata = manager.getProtectedResourceMetadata();
      expect(metadata).toMatchObject({
        resource: authConfig.audience,
        authorization_servers: [mockOidcResponse.issuer],
        scopes_supported: authConfig.scopes,
        resource_name: "Documentation MCP Server",
        bearer_methods_supported: ["header"],
      });
    });

    it("should handle OIDC discovery failure", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const manager = new McpAuthManager(authConfig);

      await expect(manager.initialize()).rejects.toThrow(
        "Failed to fetch OIDC configuration: 404",
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

      const result = await manager.validateToken("Bearer some-token");
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

    it("should throw for invalid authorization header format", async () => {
      // Initialize first
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          issuer: "https://example.clerk.accounts.dev",
          jwks_uri: "https://example.clerk.accounts.dev/.well-known/jwks.json",
        }),
      });

      const manager = new McpAuthManager(authConfig);
      await manager.initialize();

      await expect(manager.validateToken("Invalid header")).rejects.toThrow(
        "Invalid authorization header format",
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

    it("should return metadata after initialization", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          issuer: "https://example.clerk.accounts.dev",
          jwks_uri: "https://example.clerk.accounts.dev/.well-known/jwks.json",
        }),
      });

      const manager = new McpAuthManager(authConfig);
      await manager.initialize();

      const metadata = manager.getProtectedResourceMetadata();
      expect(metadata).toMatchObject({
        resource: authConfig.audience,
        authorization_servers: ["https://example.clerk.accounts.dev"],
        scopes_supported: authConfig.scopes,
      });
    });
  });

  describe("getWWWAuthenticateHeader", () => {
    it("should return basic Bearer header when no server URL", () => {
      const manager = new McpAuthManager(authConfig);

      const header = manager.getWWWAuthenticateHeader();
      expect(header).toBe("Bearer");
    });

    it("should return proper WWW-Authenticate header with metadata URL", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          issuer: "https://example.clerk.accounts.dev",
          jwks_uri: "https://example.clerk.accounts.dev/.well-known/jwks.json",
        }),
      });

      const manager = new McpAuthManager(authConfig);
      await manager.initialize();
      manager.updateMetadataWithServerUrl("https://api.example.com");

      const header = manager.getWWWAuthenticateHeader();
      expect(header).toBe(
        'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"',
      );
    });

    it("should return path-specific metadata URLs", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          issuer: "https://example.clerk.accounts.dev",
          jwks_uri: "https://example.clerk.accounts.dev/.well-known/jwks.json",
        }),
      });

      const manager = new McpAuthManager(authConfig);
      await manager.initialize();
      manager.updateMetadataWithServerUrl("https://api.example.com");

      // Test SSE endpoint
      const sseHeader = manager.getWWWAuthenticateHeader("/sse");
      expect(sseHeader).toBe(
        'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/sse"',
      );

      // Test MCP endpoint
      const mcpHeader = manager.getWWWAuthenticateHeader("/mcp");
      expect(mcpHeader).toBe(
        'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/mcp"',
      );

      // Test default endpoint
      const defaultHeader = manager.getWWWAuthenticateHeader("/other");
      expect(defaultHeader).toBe(
        'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"',
      );
    });
  });

  describe("updateMetadataWithServerUrl", () => {
    it("should update metadata with server URL", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          issuer: "https://example.clerk.accounts.dev",
          jwks_uri: "https://example.clerk.accounts.dev/.well-known/jwks.json",
        }),
      });

      const manager = new McpAuthManager(authConfig);
      await manager.initialize();

      const serverUrl = "https://api.example.com";
      manager.updateMetadataWithServerUrl(serverUrl);

      const metadata = manager.getProtectedResourceMetadata();
      expect(metadata?.resource).toBe(serverUrl);
    });

    it("should handle missing metadata gracefully", () => {
      const manager = new McpAuthManager(authConfig);

      // Should not throw even if metadata is null
      expect(() => {
        manager.updateMetadataWithServerUrl("https://api.example.com");
      }).not.toThrow();
    });
  });
});
