/**
 * Fastify middleware for OAuth2/OIDC authentication using ProxyAuthManager.
 * Provides binary authentication (authenticated vs not authenticated) for MCP endpoints.
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../utils/logger";
import type { ProxyAuthManager } from "./ProxyAuthManager";
import type { AuthContext } from "./types";

// Type for Fastify request with auth context
type AuthenticatedRequest = FastifyRequest & { auth: AuthContext };

/**
 * Create authentication middleware that validates Bearer tokens using ProxyAuthManager.
 */
export function createAuthMiddleware(authManager: ProxyAuthManager) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = await authManager.createAuthContext(
        request.headers.authorization || "",
      );

      // Always set auth context on request (even for disabled auth)
      (request as AuthenticatedRequest).auth = authContext;

      // If authentication is disabled, continue without validation
      if (!authContext.authenticated) {
        // For disabled auth, this is expected - continue processing
        // For enabled auth with missing/invalid token, this will be caught below
        const hasAuthHeader = !!request.headers.authorization;

        if (hasAuthHeader) {
          // Auth is enabled but token is invalid
          logger.debug("Token validation failed");
          reply
            .status(401)
            .header(
              "WWW-Authenticate",
              'Bearer realm="MCP Server", error="invalid_token"',
            )
            .send({
              error: "invalid_token",
              error_description: "The access token is invalid",
            });
          return;
        }

        // Missing auth header when auth is enabled
        if (authContext.scopes.size === 0) {
          logger.debug("Missing authorization header");
          reply.status(401).header("WWW-Authenticate", 'Bearer realm="MCP Server"').send({
            error: "unauthorized",
            error_description: "Authorization header required",
          });
          return;
        }
      }

      logger.debug(
        `Authentication successful for subject: ${authContext.subject || "anonymous"}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed";
      logger.debug(`Authentication error: ${message}`);

      reply
        .status(401)
        .header("WWW-Authenticate", 'Bearer realm="MCP Server", error="invalid_token"')
        .send({
          error: "invalid_token",
          error_description: "Token validation failed",
        });
    }
  };
}
