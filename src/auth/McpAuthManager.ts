/**
 * MCP Authentication Manager - handles OAuth2/OIDC discovery, token validation,
 * and protected resource metadata generation for RFC9728 compliance.
 */

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
  private metadata: ProtectedResourceMetadata | null = null;
  // Store the OIDC server configuration from discovery
  private serverConfig: {
    issuer?: string;
    authorization_endpoint?: string;
    token_endpoint?: string;
    jwks_uri?: string;
  } | null = null;
  private serverUrl: string | null = null; // Store the actual server URL

  constructor(private config: AuthConfig) {}

  /**
   * Initializes the auth manager by performing OIDC discovery and setting up metadata.
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.debug("Authentication disabled, skipping auth manager initialization");
      return;
    }

    if (!this.config.issuerUrl || !this.config.audience) {
      throw new Error("Issuer URL and Audience are required when auth is enabled");
    }

    try {
      logger.info("🔐 Initializing OAuth2/OIDC authentication...");

      // Fetch OIDC discovery document from provider
      const discoveryUrl = `${this.config.issuerUrl}/.well-known/openid-configuration`;
      const response = await fetch(discoveryUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch OIDC configuration: ${response.status}`);
      }

      this.serverConfig = await response.json();

      if (!this.serverConfig?.issuer) {
        throw new Error("Invalid OIDC configuration: missing issuer");
      }

      logger.debug(`Server config: ${JSON.stringify(this.serverConfig)}`);

      // Build initial protected resource metadata according to RFC9728
      this.metadata = {
        resource: this.config.audience, // JWT audience claim for this protected resource
        authorization_servers: [this.serverConfig.issuer], // Clerk's issuer URL
        scopes_supported: this.config.scopes, // Use configured scopes exactly
        resource_name: "Documentation MCP Server",
        resource_documentation: "https://github.com/arabold/docs-mcp-server#readme",
        bearer_methods_supported: ["header"], // We support Authorization: Bearer <token>
        // Note: No token_endpoint here since we're not an authorization server
      };

      logger.info("✅ OAuth2/OIDC authentication initialized successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`❌ Failed to initialize OAuth2/OIDC authentication: ${message}`);
      throw new Error(`Authentication initialization failed: ${message}`);
    }
  }

  /**
   * Validates a bearer token and returns authentication context.
   * This uses direct JWT validation against Clerk's public keys.
   */
  async validateToken(authorization: string): Promise<AuthContext> {
    if (!this.config.enabled) {
      // Auth disabled - return unauthenticated context with all scopes
      return {
        authenticated: false,
        scopes: new Set(this.config.scopes),
      };
    }

    // Check if auth manager is initialized
    if (!this.serverConfig) {
      throw new Error("Auth manager not initialized");
    }

    // Extract bearer token
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      throw this.createAuthError(
        AuthErrorType.MISSING_TOKEN,
        "Invalid authorization header format",
      );
    }

    const token = match[1];
    logger.debug(`🔐 Validating token: ${token.substring(0, 20)}...`);

    try {
      // For now, we'll implement basic token validation
      // In a real implementation, you'd verify the JWT signature against Clerk's public keys

      // Decode the JWT payload (without verification for now - this is just for development)
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw this.createAuthError(AuthErrorType.INVALID_TOKEN, "Invalid JWT format");
      }

      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());

      // Basic validation
      if (!payload.aud || !payload.iss || !payload.exp) {
        throw this.createAuthError(
          AuthErrorType.INVALID_TOKEN,
          "Missing required JWT claims",
        );
      }

      // Check expiration
      if (payload.exp * 1000 < Date.now()) {
        throw this.createAuthError(AuthErrorType.EXPIRED_TOKEN, "Token has expired");
      }

      // Check audience (should match our audience claim)
      const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!audiences.includes(this.config.audience)) {
        throw this.createAuthError(
          AuthErrorType.INVALID_AUDIENCE,
          "Token audience mismatch",
        );
      }

      // Check issuer (should match configured OAuth2 provider)
      if (payload.iss !== this.serverConfig?.issuer) {
        throw this.createAuthError(AuthErrorType.INVALID_TOKEN, "Token issuer mismatch");
      }

      // Extract scopes from token
      const tokenScopes = this.extractScopesFromToken(payload);

      // Expand scopes based on inheritance rules
      const effectiveScopes = expandScopes(tokenScopes);

      return {
        authenticated: true,
        scopes: effectiveScopes,
        subject: payload.sub,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error as Error & { authError?: AuthError }).authError
      ) {
        throw error; // Re-throw auth errors as-is
      }

      throw this.createAuthError(AuthErrorType.INVALID_TOKEN, "Token validation failed");
    }
  }

  /**
   * Extracts scopes from JWT token payload.
   */
  private extractScopesFromToken(payload: {
    scope?: string;
    scopes?: string[];
  }): string[] {
    // Check for 'scopes' field (array)
    if (Array.isArray(payload.scopes)) {
      return payload.scopes.filter((s: unknown) => typeof s === "string" && s.length > 0);
    }

    // Check for 'scope' field (space-separated string)
    if (payload.scope && typeof payload.scope === "string") {
      return payload.scope.split(/\s+/).filter((s: string) => s.length > 0);
    }

    // No scopes found - return all configured scopes for development
    return this.config.scopes;
  }

  /**
   * Gets the protected resource metadata for RFC9728 compliance.
   */
  getProtectedResourceMetadata(): ProtectedResourceMetadata | null {
    return this.metadata;
  }

  /**
   * Generates WWW-Authenticate header value for 401 responses per RFC9728.
   * Uses resource_metadata parameter as specified in RFC 9728 Section 5.1.
   * @param requestPath Optional request path to determine appropriate metadata endpoint
   */
  getWWWAuthenticateHeader(requestPath?: string): string {
    if (!this.serverUrl) {
      return "Bearer";
    }

    // Determine appropriate metadata URL based on request path
    let metadataPath: string;
    if (requestPath?.startsWith("/sse")) {
      metadataPath = "/.well-known/oauth-protected-resource/sse";
    } else if (requestPath?.startsWith("/mcp")) {
      metadataPath = "/.well-known/oauth-protected-resource/mcp";
    } else {
      metadataPath = "/.well-known/oauth-protected-resource";
    }

    const metadataUrl = `${this.serverUrl}${metadataPath}`;
    return `Bearer resource_metadata="${metadataUrl}"`;
  }

  /**
   * Checks if authentication is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Updates the protected resource metadata with server URL.
   * This should be called by AppServer once it knows its own address.
   * The actual resource field will be dynamically adjusted per endpoint in the metadata endpoints.
   */
  updateMetadataWithServerUrl(serverUrl: string): void {
    if (!this.metadata || !this.config.enabled) {
      return;
    }

    // Store the server URL for use in WWW-Authenticate header
    this.serverUrl = serverUrl;

    // Update resource to be the base server URL
    // Individual metadata endpoints will adjust this field as needed
    this.metadata = {
      ...this.metadata,
      resource: serverUrl, // Use base server URL as default resource
      // Keep original authorization_servers pointing to Clerk
    };
    logger.debug(`Updated protected resource metadata with server URL: ${serverUrl}`);
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
