/**
 * Unit tests for authentication middleware.
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpAuthManager } from "./McpAuthManager";
import { createAuthMiddleware, createScopeMiddleware } from "./middleware";
import type { AuthConfig, McpScope } from "./types";

describe("Authentication Middleware", () => {
  let mockManager: McpAuthManager;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    const authConfig: AuthConfig = {
      enabled: true,
      providerUrl: "https://example.com/oauth2",
      resourceId: "https://api.example.com",
      scopes: ["read:docs"],
    };

    mockManager = new McpAuthManager(authConfig);

    mockRequest = {
      headers: {},
      auth: undefined,
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
      const disabledManager = new McpAuthManager(disabledConfig);
      const middleware = createAuthMiddleware(disabledManager);

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.auth).toEqual({
        authenticated: false,
        scopes: new Set(["read:docs", "write:docs", "admin:jobs"]),
      });
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it("should return 401 when no authorization header", async () => {
      const middleware = createAuthMiddleware(mockManager);

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.header).toHaveBeenCalledWith(
        "WWW-Authenticate",
        expect.any(String),
      );
    });

    it("should handle auth manager initialization errors", async () => {
      mockRequest.headers = { authorization: "Bearer valid-token" };
      const middleware = createAuthMiddleware(mockManager);

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
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

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it("should deny access when user lacks required scope", async () => {
      mockRequest.body = { method: "cancel_job", id: 1 };
      const middleware = createScopeMiddleware();

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it("should handle unauthenticated requests", async () => {
      mockRequest.auth = {
        authenticated: false,
        scopes: new Set(),
      };
      const middleware = createScopeMiddleware();

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it("should handle missing auth context", async () => {
      mockRequest.auth = undefined;
      const middleware = createScopeMiddleware();

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it("should allow access for non-JSON-RPC requests", async () => {
      mockRequest.body = { not: "jsonrpc" };
      const middleware = createScopeMiddleware();

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });
  });
});
