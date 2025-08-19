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
      scopes: [], // Legacy field, not used
    };

    disabledAuthConfig = {
      enabled: false,
      issuerUrl: undefined,
      audience: undefined,
      scopes: [], // Legacy field, not used
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
        // Create a valid JWT token (base64 encoded)
        const payload = {
          iss: "https://auth.example.com",
          aud: "https://mcp.example.com",
          sub: "user123",
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        };
        const token = createMockJWT(payload);

        const context = await authManager.createAuthContext(`Bearer ${token}`);

        expect(context).toEqual({
          authenticated: true,
          scopes: new Set(["*"]),
          subject: "user123",
        });
      });

      it("should return unauthenticated context for expired token", async () => {
        const payload = {
          iss: "https://auth.example.com",
          aud: "https://mcp.example.com",
          sub: "user123",
          exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        };
        const token = createMockJWT(payload);

        const context = await authManager.createAuthContext(`Bearer ${token}`);

        expect(context).toEqual({
          authenticated: false,
          scopes: new Set(),
        });
      });

      it("should return unauthenticated context for token with wrong audience", async () => {
        const payload = {
          iss: "https://auth.example.com",
          aud: "https://wrong-audience.com",
          sub: "user123",
          exp: Math.floor(Date.now() / 1000) + 3600,
        };
        const token = createMockJWT(payload);

        const context = await authManager.createAuthContext(`Bearer ${token}`);

        expect(context).toEqual({
          authenticated: false,
          scopes: new Set(),
        });
      });

      it("should return unauthenticated context for token with wrong issuer", async () => {
        const payload = {
          iss: "https://wrong-issuer.com",
          aud: "https://mcp.example.com",
          sub: "user123",
          exp: Math.floor(Date.now() / 1000) + 3600,
        };
        const token = createMockJWT(payload);

        const context = await authManager.createAuthContext(`Bearer ${token}`);

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

      it("should return unauthenticated context for malformed JWT", async () => {
        const context = await authManager.createAuthContext("Bearer invalid.jwt.token");

        expect(context).toEqual({
          authenticated: false,
          scopes: new Set(),
        });
      });

      it("should handle token with array audience", async () => {
        const payload = {
          iss: "https://auth.example.com",
          aud: ["https://mcp.example.com", "https://other.example.com"],
          sub: "user123",
          exp: Math.floor(Date.now() / 1000) + 3600,
        };
        const token = createMockJWT(payload);

        const context = await authManager.createAuthContext(`Bearer ${token}`);

        expect(context).toEqual({
          authenticated: true,
          scopes: new Set(["*"]),
          subject: "user123",
        });
      });
    });
  });
});

/**
 * Helper function to create a mock JWT token for testing
 */
function createMockJWT(payload: Record<string, unknown>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64");
  const signature = "mock-signature";

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}
