/**
 * MCP Authentication Manager - handles OAuth2/OIDC discovery, token validation,
 * and protected resource metadata generation for RFC9728 compliance.
 */

import { fetchServerConfig, MCPAuth } from "mcp-auth";
import { logger } from "../utils/logger";
import { expandScopes } from "./ScopeValidator";
import type {
  AuthConfig,
  AuthContext,
  AuthError,
  ProtectedResourceMetadata,
} from "./types";
import { AuthErrorType } from "./types";

export class McpAuthManager {
  private mcpAuth: MCPAuth | null = null;
  private metadata: ProtectedResourceMetadata | null = null;
  private bearerAuth:
    | ((req: unknown, res: unknown, next: (error?: Error | null) => void) => void)
    | null = null;

  constructor(private config: AuthConfig) {}

  /**
   * Initializes the auth manager by performing OIDC discovery and setting up metadata.
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.debug("🔐 Authentication disabled, skipping auth manager initialization");
      return;
    }

    if (!this.config.providerUrl || !this.config.resourceId) {
      throw new Error("Provider URL and Resource ID are required when auth is enabled");
    }

    try {
      logger.info("🔐 Initializing OAuth2/OIDC authentication...");

      // Fetch server configuration from the provider
      const serverConfig = await fetchServerConfig(this.config.providerUrl, {
        type: "oidc", // Assume OIDC for now
      });

      // Initialize MCP Auth with server and protected resource configuration
      this.mcpAuth = new MCPAuth({
        protectedResources: [
          {
            metadata: {
              resource: this.config.resourceId,
              authorizationServers: [serverConfig],
              scopesSupported: this.config.scopes,
              resourceName: "Docs MCP Server",
              resourceDocumentation: "https://github.com/arabold/docs-mcp-server#readme",
            },
          },
        ],
      });

      // Create bearer auth middleware for JWT validation
      this.bearerAuth = this.mcpAuth.bearerAuth("jwt", {
        resource: this.config.resourceId,
        audience: this.config.resourceId,
        requiredScopes: this.config.scopes,
      });

      // Build protected resource metadata
      this.metadata = this.buildProtectedResourceMetadata();

      logger.info("✅ OAuth2/OIDC authentication initialized successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`❌ Failed to initialize OAuth2/OIDC authentication: ${message}`);
      throw new Error(`Authentication initialization failed: ${message}`);
    }
  }

  /**
   * Validates a bearer token and returns authentication context.
   * This is a simplified version that delegates to mcp-auth middleware.
   */
  async validateToken(authorization: string): Promise<AuthContext> {
    if (!this.config.enabled) {
      // Auth disabled - return unauthenticated context with all scopes
      return {
        authenticated: false,
        scopes: new Set(this.config.scopes),
      };
    }

    if (!this.bearerAuth) {
      throw this.createAuthError(
        AuthErrorType.INVALID_CONFIGURATION,
        "Auth manager not initialized",
      );
    }

    // Extract bearer token
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      throw this.createAuthError(
        AuthErrorType.MISSING_TOKEN,
        "Invalid authorization header format",
      );
    }

    try {
      // Create a mock request object for the bearer auth middleware
      const mockReq = {
        headers: { authorization },
        auth: undefined as
          | { scopes?: string[]; scope?: string; sub?: string; subject?: string }
          | undefined,
      };

      // Use the bearer auth middleware to validate the token
      await new Promise<void>((resolve, reject) => {
        if (!this.bearerAuth) {
          reject(new Error("Bearer auth not initialized"));
          return;
        }
        this.bearerAuth(mockReq, {}, (error?: Error | null) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      // Extract auth info from the mock request
      const authInfo = mockReq.auth;
      if (!authInfo) {
        throw this.createAuthError(
          AuthErrorType.INVALID_TOKEN,
          "Token validation failed",
        );
      }

      // Extract scopes from auth info
      const tokenScopes = this.extractScopesFromAuthInfo(authInfo);

      // Expand scopes based on inheritance rules
      const effectiveScopes = expandScopes(tokenScopes);

      return {
        authenticated: true,
        scopes: effectiveScopes,
        subject: authInfo.sub || authInfo.subject,
      };
    } catch (error) {
      if (error instanceof Error) {
        // Map MCP Auth errors to our error types
        if (error.message.includes("expired")) {
          throw this.createAuthError(AuthErrorType.EXPIRED_TOKEN, "Token has expired");
        }
        if (error.message.includes("audience")) {
          throw this.createAuthError(
            AuthErrorType.INVALID_AUDIENCE,
            "Token audience mismatch",
          );
        }
        if (error.message.includes("signature")) {
          throw this.createAuthError(
            AuthErrorType.INVALID_TOKEN,
            "Invalid token signature",
          );
        }
      }

      throw this.createAuthError(AuthErrorType.INVALID_TOKEN, "Token validation failed");
    }
  }

  /**
   * Gets the protected resource metadata for RFC9728 compliance.
   */
  getProtectedResourceMetadata(): ProtectedResourceMetadata | null {
    return this.metadata;
  }

  /**
   * Generates WWW-Authenticate header value for 401 responses.
   */
  getWWWAuthenticateHeader(): string {
    if (!this.config.resourceId) {
      return "Bearer";
    }

    const metadataUrl = `${this.config.resourceId}/.well-known/oauth-protected-resource`;
    return `Bearer resource="${this.config.resourceId}", authorization_uri="${metadataUrl}"`;
  }

  /**
   * Checks if authentication is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Gets the bearer auth middleware for direct use in routes.
   */
  getBearerAuthMiddleware():
    | ((req: unknown, res: unknown, next: (error?: Error | null) => void) => void)
    | null {
    return this.bearerAuth;
  }

  /**
   * Gets the protected resource metadata router from mcp-auth.
   */
  getProtectedResourceMetadataRouter():
    | ((req: unknown, res: unknown, next: () => void) => void)
    | null {
    if (!this.mcpAuth) {
      return null;
    }
    // Use the built-in metadata router from mcp-auth
    return this.mcpAuth.protectedResourceMetadataRouter();
  }

  /**
   * Builds protected resource metadata for RFC9728 compliance.
   */
  private buildProtectedResourceMetadata(): ProtectedResourceMetadata {
    if (!this.config.resourceId || !this.config.providerUrl) {
      throw new Error("Cannot build metadata without resource ID and provider URL");
    }

    return {
      resource: this.config.resourceId,
      authorization_servers: [this.config.providerUrl],
      scopes_supported: this.config.scopes,
      resource_name: "Docs MCP Server",
      resource_documentation: "https://github.com/arabold/docs-mcp-server#readme",
    };
  }

  /**
   * Extracts scopes from auth info object provided by mcp-auth.
   */
  private extractScopesFromAuthInfo(authInfo: {
    scopes?: string[];
    scope?: string;
  }): string[] {
    // Check for 'scopes' field (array)
    if (Array.isArray(authInfo.scopes)) {
      return authInfo.scopes.filter(
        (s: unknown) => typeof s === "string" && s.length > 0,
      );
    }

    // Check for 'scope' field (space-separated string)
    if (authInfo.scope && typeof authInfo.scope === "string") {
      return authInfo.scope.split(/\s+/).filter((s: string) => s.length > 0);
    }

    // No scopes found
    return [];
  }

  /**
   * Creates a standardized auth error.
   */
  private createAuthError(type: AuthErrorType, message: string): Error {
    const authError: AuthError = { type, message };
    const error = new Error(message);
    (error as Error & { authError: AuthError }).authError = authError;
    return error;
  }
}
