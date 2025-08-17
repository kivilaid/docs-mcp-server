/**
 * Express middleware for OAuth2/OIDC bearer token authentication.
 * Handles token validation and scope enforcement for MCP endpoints.
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../utils/logger";
import type { McpAuthManager } from "./McpAuthManager";
import { validateToolAccess } from "./ScopeValidator";
import type { AuthContext, AuthError } from "./types";
import { AuthErrorType } from "./types";

declare module "fastify" {
  interface FastifyRequest {
    /** Authentication context for the request */
    auth?: AuthContext;
  }
}

/**
 * Creates bearer token authentication middleware for MCP routes.
 */
export function createAuthMiddleware(authManager: McpAuthManager) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth if disabled
    if (!authManager.isEnabled()) {
      request.auth = {
        authenticated: false,
        scopes: new Set(["read:docs", "write:docs", "admin:jobs"]),
      };
      return;
    }

    const authorization = request.headers.authorization;

    try {
      if (!authorization) {
        // Missing authorization header
        return reply
          .status(401)
          .header("WWW-Authenticate", authManager.getWWWAuthenticateHeader())
          .send({
            error: "unauthorized",
            message: "Authorization header required",
          });
      }

      // Validate token and get auth context
      const authContext = await authManager.validateToken(authorization);
      request.auth = authContext;

      logger.debug(
        `🔐 Authenticated request: subject=${authContext.subject}, scopes=[${Array.from(authContext.scopes).join(", ")}]`,
      );
    } catch (error) {
      // Handle authentication errors
      const authError = (error as Error & { authError?: AuthError }).authError;

      if (authError) {
        switch (authError.type) {
          case AuthErrorType.MISSING_TOKEN:
          case AuthErrorType.INVALID_TOKEN:
          case AuthErrorType.EXPIRED_TOKEN:
          case AuthErrorType.INVALID_AUDIENCE:
            return reply
              .status(401)
              .header("WWW-Authenticate", authManager.getWWWAuthenticateHeader())
              .send({
                error: "unauthorized",
                message: authError.message,
              });
          default:
            logger.error(`🔐 Authentication error: ${authError.message}`);
            return reply.status(500).send({
              error: "internal_server_error",
              message: "Authentication service error",
            });
        }
      }

      // Unknown error
      logger.error(
        `🔐 Unexpected authentication error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return reply.status(500).send({
        error: "internal_server_error",
        message: "Authentication service error",
      });
    }
  };
}

/**
 * Creates middleware to enforce MCP tool scope requirements.
 * Should be used after auth middleware to validate specific tool access.
 */
export function createScopeMiddleware() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.auth) {
      // Auth middleware should have set this
      return reply.status(500).send({
        error: "internal_server_error",
        message: "Authentication context missing",
      });
    }

    // For unauthenticated requests (auth disabled), allow everything
    if (!request.auth.authenticated) {
      return;
    }

    // Extract MCP method from request body for JSON-RPC
    const body = request.body as { method?: string; id?: string | number } | undefined;
    if (!body || typeof body !== "object" || !body.method) {
      // Not a JSON-RPC request or missing method - let it through
      // The MCP server will handle invalid requests
      return;
    }

    const method = body.method as string;
    const scopeValidation = validateToolAccess(method, request.auth.scopes);

    if (!scopeValidation.authorized) {
      logger.debug(
        `🔐 Access denied for method '${method}': missing scopes [${scopeValidation.missingScopes.join(", ")}]`,
      );

      // Return JSON-RPC error for insufficient scope
      return reply.status(403).send({
        jsonrpc: "2.0",
        id: body.id || null,
        error: {
          code: -32001, // JSON-RPC error code for insufficient scope
          message: "Insufficient scope",
          data: {
            required_scopes: scopeValidation.missingScopes,
            method: method,
          },
        },
      });
    }

    logger.debug(`🔐 Access granted for method '${method}'`);
  };
}
