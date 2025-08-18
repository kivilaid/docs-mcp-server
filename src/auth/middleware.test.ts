/**
 * Unit tests for authentication middleware with ProxyAuthManager.
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthMiddleware, createScopeMiddleware } from "./middleware";
import { ProxyAuthManager } from "./ProxyAuthManager";
import type { AuthConfig, AuthContext, McpScope } from "./types";

// Extend FastifyRequest to include our auth property
interface AuthenticatedRequest extends FastifyRequest {
  auth?: AuthContext;
}

describe("Authentication Middleware", () => {
  let mockManager: ProxyAuthManager;
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    const authConfig: AuthConfig = {
      enabled: true,
      issuerUrl: "https://example.com/oauth2",
      audience: "https://api.example.com",
      scopes: ["read:docs"],
    };

    mockManager = new ProxyAuthManager(authConfig);

    mockRequest = {
      headers: {
        host: "localhost:3000",
      },
      auth: undefined,
      url: "/mcp",
      protocol: "http",
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
    };

    vi.clearAllMocks();
  });

  describe("createAuthMiddleware", () => {
    it("should skip auth when manager is disabled", async () => {
      const disabledConfig: AuthConfig = { enabled: false, scopes: [] };
      const disabledManager = new ProxyAuthManager(disabledConfig);
      const middleware = createAuthMiddleware(disabledManager);

      // Mock the createAuthContext method for disabled auth
      vi.spyOn(disabledManager, "createAuthContext").mockResolvedValue({
        authenticated: false,
        scopes: new Set(["read:docs", "write:docs", "admin:jobs"]),
      });

      await middleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

      expect(mockRequest.auth).toEqual({
        authenticated: false,
        scopes: new Set(["read:docs", "write:docs", "admin:jobs"]),
      });
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it("should return 401 when no authorization header", async () => {
      const middleware = createAuthMiddleware(mockManager);

      await middleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.header).toHaveBeenCalledWith(
        "WWW-Authenticate",
        expect.stringContaining("Bearer"),
      );
    });

    it("should authenticate valid token", async () => {
      mockRequest.headers = {
        authorization: "Bearer valid-token",
        host: "localhost:3000",
      };

      // Mock successful authentication
      vi.spyOn(mockManager, "createAuthContext").mockResolvedValue({
        authenticated: true,
        scopes: new Set<McpScope>(["read:docs"]),
        subject: "test-user",
      });

      const middleware = createAuthMiddleware(mockManager);
      await middleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

      expect(mockRequest.auth).toEqual({
        authenticated: true,
        scopes: new Set(["read:docs"]),
        subject: "test-user",
      });
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it("should return 401 for invalid token", async () => {
      mockRequest.headers = {
        authorization: "Bearer invalid-token",
        host: "localhost:3000",
      };

      // Mock authentication failure
      vi.spyOn(mockManager, "createAuthContext").mockRejectedValue(
        new Error("Invalid token"),
      );

      const middleware = createAuthMiddleware(mockManager);
      await middleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: "invalid_token",
        error_description: "Token validation failed",
      });
    });

    it("should return 401 for unauthenticated token", async () => {
      mockRequest.headers = {
        authorization: "Bearer expired-token",
        host: "localhost:3000",
      };

      // Mock unauthenticated response
      vi.spyOn(mockManager, "createAuthContext").mockResolvedValue({
        authenticated: false,
        scopes: new Set(),
      });

      const middleware = createAuthMiddleware(mockManager);
      await middleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: "invalid_token",
        error_description: "The access token is invalid",
      });
    });
  });

  describe("createScopeMiddleware", () => {
    beforeEach(() => {
      // Set up authenticated request
      mockRequest.auth = {
        authenticated: true,
        scopes: new Set<McpScope>(["read:docs"]),
      };
      mockRequest.body = { method: "list_libraries", id: 1 };
    });

    it("should allow access when user has required scope", async () => {
      const middleware = createScopeMiddleware();

      await middleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it("should deny access when user lacks required scope", async () => {
      // User only has read:docs, but we require write:docs
      mockRequest.auth = {
        authenticated: true,
        scopes: new Set<McpScope>(["read:docs"]),
        subject: "test-user",
      };

      const middleware = createScopeMiddleware(["write:docs"]);

      await middleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: "insufficient_scope",
        error_description: "Required scopes: write:docs",
      });
    });

    it("should handle unauthenticated requests gracefully", async () => {
      mockRequest.auth = {
        authenticated: false,
        scopes: new Set(),
      };
      const middleware = createScopeMiddleware();

      await middleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

      // Should not block unauthenticated requests - that's the auth middleware's job
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it("should handle missing auth context", async () => {
      mockRequest.auth = undefined;
      const middleware = createScopeMiddleware();

      await middleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: "unauthorized",
        error_description: "Authentication required",
      });
    });

    it("should allow access for non-JSON-RPC requests", async () => {
      mockRequest.body = { not: "jsonrpc" };
      const middleware = createScopeMiddleware();

      await middleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it("should handle malformed request body", async () => {
      mockRequest.body = "invalid json";
      const middleware = createScopeMiddleware();

      await middleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

      // Should not throw, just pass through since it's not JSON-RPC
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it("should allow access with inherited scopes", async () => {
      // write:docs scope includes read:docs access
      mockRequest.auth = {
        authenticated: true,
        scopes: new Set<McpScope>(["write:docs"]),
      };
      mockRequest.body = { method: "list_libraries", id: 1 }; // requires read:docs

      const middleware = createScopeMiddleware();
      await middleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it("should handle unknown tool methods gracefully", async () => {
      mockRequest.body = { method: "unknown_method", id: 1 };
      const middleware = createScopeMiddleware();

      await middleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

      // Unknown methods should be allowed through
      expect(mockReply.status).not.toHaveBeenCalled();
    });
  });
});
