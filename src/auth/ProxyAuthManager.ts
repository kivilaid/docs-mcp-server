/**
 * Simplified MCP Authentication Manager using the MCP SDK's ProxyOAuthServerProvider.
 * This provides OAuth2 proxy functionality for Fastify, leveraging the SDK's auth logic
 * while maintaining compatibility with the existing Fastify-based architecture.
 * Uses standard OAuth identity scopes with binary authentication (authenticated vs not).
 * Validates tokens using the OAuth provider's userinfo endpoint for universal compatibility.
 */

import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { logger } from "../utils/logger";
import type { AuthConfig, AuthContext } from "./types";

export class ProxyAuthManager {
  private proxyProvider: ProxyOAuthServerProvider | null = null;
  private discoveredEndpoints: {
    authorizationUrl: string;
    tokenUrl: string;
    revocationUrl?: string;
    registrationUrl?: string;
    userinfoUrl?: string;
  } | null = null;

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

      // Discover and cache the OAuth endpoints from the provider
      this.discoveredEndpoints = await this.discoverEndpoints();

      // Create the proxy provider
      this.proxyProvider = new ProxyOAuthServerProvider({
        endpoints: {
          authorizationUrl: this.discoveredEndpoints.authorizationUrl,
          tokenUrl: this.discoveredEndpoints.tokenUrl,
          revocationUrl: this.discoveredEndpoints.revocationUrl,
          registrationUrl: this.discoveredEndpoints.registrationUrl,
        },
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
   * Discover OAuth endpoints from the OIDC provider and cache them.
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
      // Cache userinfo endpoint for token validation
      userinfoUrl: config.userinfo_endpoint,
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
   * Verify an access token using the OAuth provider's userinfo endpoint.
   * This is called by the proxy provider to validate tokens.
   * Uses binary authentication - if token is valid, user gets full access.
   * Works with any token format (JWT, opaque, etc.) by delegating validation to the auth server.
   */
  private async verifyAccessToken(token: string, request?: FastifyRequest) {
    try {
      logger.debug(`Attempting to verify access token: ${token.substring(0, 20)}...`);

      if (!this.discoveredEndpoints?.userinfoUrl) {
        throw new Error("Userinfo endpoint not available");
      }

      // Call the userinfo endpoint to validate the token and get user information
      const response = await fetch(this.discoveredEndpoints.userinfoUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Userinfo request failed: ${response.status} ${response.statusText}`,
        );
      }

      const userinfo = await response.json();
      logger.debug(
        `Token validation successful. User: ${userinfo.sub}, Email: ${userinfo.email}`,
      );

      // Basic validation - ensure we have a subject
      if (!userinfo.sub) {
        throw new Error("Userinfo response missing subject");
      }

      // Optional: Resource validation if MCP Authorization spec requires it
      // This is simplified - in a real implementation you might want more sophisticated resource validation
      if (request) {
        const supportedResources = this.getSupportedResources(request);
        logger.debug(`Supported resources: ${JSON.stringify(supportedResources)}`);
        // For now, we allow access if the token is valid - binary authentication
      }

      // Binary authentication: valid token = full access
      return {
        token,
        clientId: userinfo.sub,
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
