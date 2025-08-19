/**
 * Simplified MCP Authentication Manager using the MCP SDK's ProxyOAuthServerProvider.
 * This provides OAuth2 proxy functionality for Fastify, leveraging the SDK's auth logic
 * while maintaining compatibility with the existing Fastify-based architecture.
 * Uses standard OAuth identity scopes with binary authentication (authenticated vs not).
 * Supports both JWT tokens (self-contained) and opaque tokens (via RFC 7662 introspection).
 */

import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { logger } from "../utils/logger";
import type { AuthConfig, AuthContext } from "./types";

export class ProxyAuthManager {
  private proxyProvider: ProxyOAuthServerProvider | null = null;

  constructor(private config: AuthConfig) {}

  /**
   * Get the authentication configuration
   */
  get authConfig(): AuthConfig {
    return this.config;
  }

  /**
   * Initialize the proxy auth manager with the configured OAuth provider.
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.debug("Authentication disabled, skipping proxy auth manager initialization");
      return;
    }

    if (!this.config.issuerUrl || !this.config.audience) {
      throw new Error("Issuer URL and Audience are required when auth is enabled");
    }

    try {
      logger.info("🔐 Initializing OAuth2 proxy authentication...");

      // Discover the OAuth endpoints from the provider
      const endpoints = await this.discoverEndpoints();

      // Create the proxy provider
      this.proxyProvider = new ProxyOAuthServerProvider({
        endpoints,
        verifyAccessToken: this.verifyAccessToken.bind(this),
        getClient: this.getClient.bind(this),
      });

      logger.info("✅ OAuth2 proxy authentication initialized successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`❌ Failed to initialize OAuth2 proxy authentication: ${message}`);
      throw new Error(`Proxy authentication initialization failed: ${message}`);
    }
  }

  /**
   * Register OAuth2 endpoints on the Fastify server.
   * This manually implements the necessary OAuth2 endpoints using the proxy provider.
   */
  registerRoutes(server: FastifyInstance, baseUrl: URL): void {
    if (!this.proxyProvider) {
      throw new Error("Proxy provider not initialized");
    }

    // OAuth2 Authorization Server Metadata (RFC 8414)
    server.get("/.well-known/oauth-authorization-server", async (_request, reply) => {
      const metadata = {
        issuer: baseUrl.origin,
        authorization_endpoint: `${baseUrl.origin}/oauth/authorize`,
        token_endpoint: `${baseUrl.origin}/oauth/token`,
        revocation_endpoint: `${baseUrl.origin}/oauth/revoke`,
        registration_endpoint: `${baseUrl.origin}/oauth/register`,
        scopes_supported: ["profile", "email"],
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: [
          "client_secret_basic",
          "client_secret_post",
          "none",
        ],
        code_challenge_methods_supported: ["S256"],
      };

      reply.type("application/json").send(metadata);
    });

    // OAuth2 Protected Resource Metadata (RFC 9728)
    server.get("/.well-known/oauth-protected-resource", async (request, reply) => {
      const baseUrl = `${request.protocol}://${request.headers.host}`;
      const metadata = {
        resource: `${baseUrl}/sse`,
        authorization_servers: [this.config.issuerUrl],
        scopes_supported: ["profile", "email"],
        bearer_methods_supported: ["header"],
        resource_name: "Documentation MCP Server",
        resource_documentation: "https://github.com/arabold/docs-mcp-server#readme",
        // Enhanced metadata for better discoverability
        resource_server_metadata_url: `${baseUrl}/.well-known/oauth-protected-resource`,
        authorization_server_metadata_url: `${this.config.issuerUrl}/.well-known/openid-configuration`,
        jwks_uri: `${this.config.issuerUrl}/.well-known/jwks.json`,
        // Supported MCP transports
        mcp_transports: [
          {
            transport: "sse",
            endpoint: `${baseUrl}/sse`,
            description: "Server-Sent Events transport",
          },
          {
            transport: "http",
            endpoint: `${baseUrl}/mcp`,
            description: "Streaming HTTP transport",
          },
        ],
      };

      reply.type("application/json").send(metadata);
    });

    // OAuth2 Authorization endpoint
    server.get("/oauth/authorize", async (request, reply) => {
      // In a proxy setup, redirect to the upstream authorization server
      const endpoints = await this.discoverEndpoints();
      const params = new URLSearchParams(request.query as Record<string, string>);

      // Add resource parameter (RFC 8707) for token binding
      if (!params.has("resource")) {
        const resourceUrl = `${request.protocol}://${request.headers.host}/sse`;
        params.set("resource", resourceUrl);
      }

      const redirectUrl = `${endpoints.authorizationUrl}?${params.toString()}`;
      reply.redirect(redirectUrl);
    });

    // OAuth2 Token endpoint
    server.post("/oauth/token", async (request, reply) => {
      // Proxy token requests to the upstream server
      const endpoints = await this.discoverEndpoints();

      // Prepare token request body, preserving resource parameter if present
      const tokenBody = new URLSearchParams(request.body as Record<string, string>);

      // Add resource parameter if not already present (for backward compatibility)
      if (!tokenBody.has("resource")) {
        const resourceUrl = `${request.protocol}://${request.headers.host}/sse`;
        tokenBody.set("resource", resourceUrl);
      }

      const response = await fetch(endpoints.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenBody.toString(),
      });

      const data = await response.json();
      reply.status(response.status).type("application/json").send(data);
    });

    // OAuth2 Token Revocation endpoint
    server.post("/oauth/revoke", async (request, reply) => {
      const endpoints = await this.discoverEndpoints();

      if (endpoints.revocationUrl) {
        const response = await fetch(endpoints.revocationUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams(request.body as Record<string, string>).toString(),
        });

        reply.status(response.status).send();
      } else {
        reply.status(404).send({ error: "Revocation not supported" });
      }
    });

    // OAuth2 Dynamic Client Registration endpoint
    server.post("/oauth/register", async (request, reply) => {
      const endpoints = await this.discoverEndpoints();

      if (endpoints.registrationUrl) {
        const response = await fetch(endpoints.registrationUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request.body),
        });

        const data = await response.json();
        reply.status(response.status).type("application/json").send(data);
      } else {
        reply.status(404).send({ error: "Dynamic client registration not supported" });
      }
    });

    logger.debug("OAuth2 endpoints registered on Fastify server");
  }

  /**
   * Discover OAuth endpoints from the OIDC provider.
   */
  private async discoverEndpoints() {
    const discoveryUrl = `${this.config.issuerUrl}/.well-known/openid-configuration`;
    const response = await fetch(discoveryUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch OIDC configuration: ${response.status}`);
    }

    const config = await response.json();

    return {
      authorizationUrl: config.authorization_endpoint,
      tokenUrl: config.token_endpoint,
      revocationUrl: config.revocation_endpoint,
      // Clerk supports DCR at /oauth/register but doesn't advertise it in discovery
      registrationUrl:
        config.registration_endpoint || `${this.config.issuerUrl}/oauth/register`,
    };
  }

  /**
   * Get supported resource URLs for this MCP server instance.
   * This enables self-discovering resource validation per MCP Authorization spec.
   */
  private getSupportedResources(request: FastifyRequest): string[] {
    const baseUrl = `${request.protocol}://${request.headers.host}`;

    return [
      `${baseUrl}/sse`, // SSE transport
      `${baseUrl}/mcp`, // Streaming HTTP transport
      `${baseUrl}`, // Server root
    ];
  }

  /**
   * Verify an access token and return auth information.
   * This is called by the proxy provider to validate tokens.
   * Uses binary authentication - if token is valid, user gets full access.
   * Supports both JWT tokens and opaque tokens via RFC 7662 introspection.
   */
  private async verifyAccessToken(token: string, request?: FastifyRequest) {
    try {
      logger.debug(`Attempting to verify access token: ${token.substring(0, 20)}...`);

      // Try JWT decoding first (for self-contained tokens)
      let tokenInfo: {
        iss?: string;
        aud?: string | string[];
        sub?: string;
        resource?: string;
        exp?: number;
      };

      try {
        tokenInfo = this.decodeTokenBasic(token);
        logger.debug(
          `Token decoded as JWT. Issuer: ${tokenInfo.iss}, Audience: ${tokenInfo.aud}, Subject: ${tokenInfo.sub}`,
        );
      } catch (jwtError) {
        // If JWT decoding fails, try token introspection (for opaque tokens)
        logger.debug(
          `JWT decoding failed, attempting token introspection: ${jwtError instanceof Error ? jwtError.message : "Unknown error"}`,
        );
        tokenInfo = await this.introspectToken(token);
        logger.debug(
          `Token introspected successfully. Issuer: ${tokenInfo.iss}, Audience: ${tokenInfo.aud}, Subject: ${tokenInfo.sub}`,
        );
      }

      // Standard audience validation (always required)
      if (!tokenInfo.aud) {
        logger.debug("Token missing audience claim");
        throw new Error("Token missing audience claim");
      }

      const audiences = Array.isArray(tokenInfo.aud) ? tokenInfo.aud : [tokenInfo.aud];
      const expectedAudience = this.config.audience;
      if (!expectedAudience || !audiences.includes(expectedAudience)) {
        logger.debug(
          `Audience validation failed. Token audiences: ${JSON.stringify(audiences)}, Expected: ${this.config.audience}`,
        );
        throw new Error("Token audience mismatch");
      }

      // Resource validation (only if resource claim is present and request context available)
      if (tokenInfo.resource && request && typeof tokenInfo.resource === "string") {
        const supportedResources = this.getSupportedResources(request);
        if (!supportedResources.includes(tokenInfo.resource)) {
          logger.debug(
            `Resource validation failed. Token resource: ${tokenInfo.resource}, Supported: ${JSON.stringify(supportedResources)}`,
          );
          throw new Error(
            `Token resource '${tokenInfo.resource}' not supported by this server`,
          );
        }
      }

      logger.debug(`Token validation successful for subject: ${tokenInfo.sub}`);

      // Binary authentication: valid token = full access
      return {
        token,
        clientId: (tokenInfo.sub as string) || "unknown",
        scopes: ["*"], // Full access for all authenticated users
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.debug(`Token validation failed: ${errorMessage}`);
      throw new Error("Invalid access token");
    }
  }

  /**
   * Get client information for the given client ID.
   * This is called by the proxy provider for client validation.
   */
  private async getClient(clientId: string) {
    // For now, return a basic client configuration
    // In a real implementation, you might look this up from a database
    return {
      client_id: clientId,
      redirect_uris: [`${this.config.audience}/callback`],
      // Add other client metadata as needed
    };
  }

  /**
   * Decode JWT token payload without signature verification.
   * Uses proper base64url decoding as per JWT spec.
   */
  private decodeTokenBasic(token: string): Record<string, unknown> {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }

    try {
      // Use base64url decoding (replace URL-safe chars and add padding)
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      const payload = JSON.parse(Buffer.from(padded, "base64").toString());

      // Basic validation
      if (!payload.aud || !payload.iss || !payload.exp) {
        throw new Error("Missing required JWT claims");
      }

      // Check expiration
      if (payload.exp * 1000 < Date.now()) {
        throw new Error("Token has expired");
      }

      // Check issuer
      if (payload.iss !== this.config.issuerUrl) {
        throw new Error("Token issuer mismatch");
      }

      return payload;
    } catch (error) {
      if (error instanceof Error && error.message.includes("required JWT claims")) {
        throw error;
      }
      throw new Error("Invalid JWT format");
    }
  }

  /**
   * Introspect an opaque token using RFC 7662 Token Introspection.
   * This method calls the OAuth provider's introspection endpoint to validate opaque tokens.
   */
  private async introspectToken(token: string): Promise<{
    iss?: string;
    aud?: string | string[];
    sub?: string;
    resource?: string;
    exp?: number;
  }> {
    try {
      // Many OAuth providers support introspection at /oauth/introspect
      // but it's not always advertised in the discovery document
      const introspectionUrl = `${this.config.issuerUrl}/oauth/introspect`;

      logger.debug(`Introspecting token at: ${introspectionUrl}`);

      // RFC 7662 introspection request
      const response = await fetch(introspectionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          token: token,
          token_type_hint: "access_token",
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Introspection request failed: ${response.status} ${response.statusText}`,
        );
      }

      const introspectionResult = await response.json();
      logger.debug(
        `Introspection result: ${JSON.stringify(introspectionResult, null, 2)}`,
      );

      // RFC 7662: If the token is invalid or expired, the response will have active: false
      if (!introspectionResult.active) {
        throw new Error("Token is not active (invalid or expired)");
      }

      // Map introspection result to expected token info format
      const tokenInfo = {
        iss: introspectionResult.iss || this.config.issuerUrl,
        aud: introspectionResult.aud || this.config.audience,
        sub: introspectionResult.sub,
        resource: introspectionResult.resource,
        exp: introspectionResult.exp,
      };

      // Validate required claims
      if (!tokenInfo.sub) {
        throw new Error("Token missing subject claim");
      }

      // Check expiration if present
      if (tokenInfo.exp && tokenInfo.exp * 1000 < Date.now()) {
        throw new Error("Token has expired");
      }

      return tokenInfo;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.debug(`Token introspection failed: ${errorMessage}`);
      throw new Error(`Token introspection failed: ${errorMessage}`);
    }
  }

  /**
   * Create an authentication context from a token (for compatibility with existing middleware).
   * Uses binary authentication - valid token grants full access.
   */
  async createAuthContext(
    authorization: string,
    request?: FastifyRequest,
  ): Promise<AuthContext> {
    if (!this.config.enabled) {
      return {
        authenticated: false,
        scopes: new Set(),
      };
    }

    try {
      logger.debug(
        `Processing authorization header: ${authorization.substring(0, 20)}...`,
      );

      const match = authorization.match(/^Bearer\s+(.+)$/i);
      if (!match) {
        logger.debug("Authorization header does not match Bearer token pattern");
        throw new Error("Invalid authorization header format");
      }

      const token = match[1];
      logger.debug(`Extracted token: ${token.substring(0, 20)}...`);

      const authInfo = await this.verifyAccessToken(token, request);

      logger.debug(`Authentication successful for client: ${authInfo.clientId}`);

      // Binary authentication: valid token = full access
      return {
        authenticated: true,
        scopes: new Set(["*"]), // Full access for authenticated users
        subject: authInfo.clientId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.debug(`Authentication failed: ${errorMessage}`);
      return {
        authenticated: false,
        scopes: new Set(),
      };
    }
  }
}
