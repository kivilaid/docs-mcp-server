/**
 * Tests for ProxyAuthManager - focuses on behavior and public interface
 */

import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProxyAuthManager } from "./ProxyAuthManager";
import type { AuthConfig } from "./types";

// Mock the MCP SDK
vi.mock("@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js", () => ({
  ProxyOAuthServerProvider: vi.fn().mockImplementation(() => ({
    // Mock implementation
  })),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("ProxyAuthManager", () => {
  let authManager: ProxyAuthManager;
  let mockServer: FastifyInstance;
  let validAuthConfig: AuthConfig;
  let disabledAuthConfig: AuthConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    validAuthConfig = {
      enabled: true,
      issuerUrl: "https://auth.example.com",
      audience: "https://mcp.example.com",
      scopes: ["profile", "email"],
    };

    disabledAuthConfig = {
      enabled: false,
      issuerUrl: undefined,
      audience: undefined,
      scopes: [],
    };

    // Mock Fastify server
    mockServer = {
      get: vi.fn(),
      post: vi.fn(),
    } as unknown as FastifyInstance;

    // Mock successful OIDC discovery
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          authorization_endpoint: "https://auth.example.com/oauth/authorize",
          token_endpoint: "https://auth.example.com/oauth/token",
          revocation_endpoint: "https://auth.example.com/oauth/revoke",
          registration_endpoint: "https://auth.example.com/oauth/register",
          userinfo_endpoint: "https://auth.example.com/oauth/userinfo",
        }),
    });
  });

  describe("initialization", () => {
    it("should skip initialization when auth is disabled", async () => {
      authManager = new ProxyAuthManager(disabledAuthConfig);

      await expect(authManager.initialize()).resolves.toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should initialize successfully with valid config", async () => {
      authManager = new ProxyAuthManager(validAuthConfig);

      await expect(authManager.initialize()).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://auth.example.com/.well-known/openid-configuration",
      );
    });

    it("should throw error when issuer URL is missing", async () => {
      const invalidConfig = { ...validAuthConfig, issuerUrl: undefined };
      authManager = new ProxyAuthManager(invalidConfig);

      await expect(authManager.initialize()).rejects.toThrow(
        "Issuer URL and Audience are required when auth is enabled",
      );
    });

    it("should throw error when audience is missing", async () => {
      const invalidConfig = { ...validAuthConfig, audience: undefined };
      authManager = new ProxyAuthManager(invalidConfig);

      await expect(authManager.initialize()).rejects.toThrow(
        "Issuer URL and Audience are required when auth is enabled",
      );
    });

    it("should handle OIDC discovery failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      authManager = new ProxyAuthManager(validAuthConfig);

      await expect(authManager.initialize()).rejects.toThrow(
        "Proxy authentication initialization failed",
      );
    });
  });

  describe("route registration", () => {
    beforeEach(async () => {
      authManager = new ProxyAuthManager(validAuthConfig);
      await authManager.initialize();
    });

    it("should register OAuth2 endpoints on Fastify server", () => {
      const baseUrl = new URL("https://server.example.com");

      authManager.registerRoutes(mockServer, baseUrl);

      // Verify that OAuth2 endpoints were registered
      expect(mockServer.get).toHaveBeenCalledWith(
        "/.well-known/oauth-authorization-server",
        expect.any(Function),
      );
      expect(mockServer.get).toHaveBeenCalledWith(
        "/.well-known/oauth-protected-resource",
        expect.any(Function),
      );
      expect(mockServer.get).toHaveBeenCalledWith(
        "/oauth/authorize",
        expect.any(Function),
      );
      expect(mockServer.post).toHaveBeenCalledWith("/oauth/token", expect.any(Function));
      expect(mockServer.post).toHaveBeenCalledWith("/oauth/revoke", expect.any(Function));
      expect(mockServer.post).toHaveBeenCalledWith(
        "/oauth/register",
        expect.any(Function),
      );
    });

    it("should throw error when registering routes without initialization", () => {
      const uninitializedManager = new ProxyAuthManager(validAuthConfig);
      const baseUrl = new URL("https://server.example.com");

      expect(() => uninitializedManager.registerRoutes(mockServer, baseUrl)).toThrow(
        "Proxy provider not initialized",
      );
    });
  });

  describe("authentication context creation", () => {
    describe("when auth is disabled", () => {
      beforeEach(() => {
        authManager = new ProxyAuthManager(disabledAuthConfig);
      });

      it("should return unauthenticated context", async () => {
        const context = await authManager.createAuthContext("Bearer valid-token");

        expect(context).toEqual({
          authenticated: false,
          scopes: new Set(),
        });
      });
    });

    describe("when auth is enabled", () => {
      beforeEach(async () => {
        authManager = new ProxyAuthManager(validAuthConfig);
        await authManager.initialize();
      });

      it("should return authenticated context for valid token", async () => {
        // Mock successful userinfo response
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              sub: "user123",
              email: "user@example.com",
              name: "Test User",
            }),
        });

        const context = await authManager.createAuthContext("Bearer valid-token");

        expect(context).toEqual({
          authenticated: true,
          scopes: new Set(["*"]),
          subject: "user123",
        });

        // Verify userinfo endpoint was called
        expect(mockFetch).toHaveBeenCalledWith(
          "https://auth.example.com/oauth/userinfo",
          {
            method: "GET",
            headers: {
              Authorization: "Bearer valid-token",
              Accept: "application/json",
            },
          },
        );
      });

      it("should return unauthenticated context for expired/invalid token", async () => {
        // Mock userinfo endpoint returning 401 Unauthorized (invalid token)
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
        });

        const context = await authManager.createAuthContext("Bearer invalid-token");

        expect(context).toEqual({
          authenticated: false,
          scopes: new Set(),
        });
      });

      it("should return unauthenticated context for malformed authorization header", async () => {
        const context = await authManager.createAuthContext("Invalid header");

        expect(context).toEqual({
          authenticated: false,
          scopes: new Set(),
        });
      });

      it("should return unauthenticated context when userinfo endpoint fails", async () => {
        // Mock userinfo endpoint returning 500 Server Error
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        });

        const context = await authManager.createAuthContext("Bearer some-token");

        expect(context).toEqual({
          authenticated: false,
          scopes: new Set(),
        });
      });

      it("should return unauthenticated context when userinfo response missing subject", async () => {
        // Mock userinfo response without required 'sub' field
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              email: "user@example.com",
              name: "Test User",
              // Missing 'sub' field
            }),
        });

        const context = await authManager.createAuthContext("Bearer token-without-sub");

        expect(context).toEqual({
          authenticated: false,
          scopes: new Set(),
        });
      });
    });
  });
});
