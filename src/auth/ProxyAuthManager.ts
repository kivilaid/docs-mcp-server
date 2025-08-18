/**
 * Simplified MCP Authentication Manager using the MCP SDK's ProxyOAuthServerProvider.
 * This provides OAuth2 proxy functionality for Fastify, leveraging the SDK's auth logic
 * while maintaining compatibility with the existing Fastify-based architecture.
 */

import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import type { FastifyInstance } from "fastify";
import { logger } from "../utils/logger";
import { expandScopes } from "./ScopeValidator";
import type { AuthConfig, AuthContext, McpScope } from "./types";

export class ProxyAuthManager {
  private proxyProvider: ProxyOAuthServerProvider | null = null;

  constructor(private config: AuthConfig) {}

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
        scopes_supported: this.config.scopes,
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
      const resourceUrl = `${request.protocol}://${request.headers.host}/sse`;
      const metadata = {
        resource: resourceUrl,
        authorization_servers: [this.config.issuerUrl],
        scopes_supported: this.config.scopes,
        bearer_methods_supported: ["header"],
        resource_name: "Documentation MCP Server",
        resource_documentation: "https://github.com/arabold/docs-mcp-server#readme",
      };

      reply.type("application/json").send(metadata);
    });

    // OAuth2 Authorization endpoint
    server.get("/oauth/authorize", async (request, reply) => {
      // In a proxy setup, redirect to the upstream authorization server
      const endpoints = await this.discoverEndpoints();
      const params = new URLSearchParams(request.query as Record<string, string>);
      const redirectUrl = `${endpoints.authorizationUrl}?${params.toString()}`;

      reply.redirect(redirectUrl);
    });

    // OAuth2 Token endpoint
    server.post("/oauth/token", async (request, reply) => {
      // Proxy token requests to the upstream server
      const endpoints = await this.discoverEndpoints();

      const response = await fetch(endpoints.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(request.body as Record<string, string>).toString(),
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
   * Verify an access token and return auth information.
   * This is called by the proxy provider to validate tokens.
   */
  private async verifyAccessToken(token: string) {
    try {
      // For now, use the simple token validation from the current implementation
      // In production, you'd want proper JWT verification
      const decoded = this.decodeTokenBasic(token);

      // Extract scopes from the token
      const scopes = this.extractScopes(decoded);

      return {
        token,
        clientId: (decoded.sub as string) || "unknown",
        scopes: Array.from(scopes),
      };
    } catch (error) {
      logger.debug(`Token validation failed: ${error}`);
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
   * Basic JWT token decoding (without signature verification).
   * This replicates the current simple validation approach.
   */
  private decodeTokenBasic(token: string): Record<string, unknown> {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());

    // Basic validation
    if (!payload.aud || !payload.iss || !payload.exp) {
      throw new Error("Missing required JWT claims");
    }

    // Check expiration
    if (payload.exp * 1000 < Date.now()) {
      throw new Error("Token has expired");
    }

    // Check audience
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(this.config.audience)) {
      throw new Error("Token audience mismatch");
    }

    // Check issuer
    if (payload.iss !== this.config.issuerUrl) {
      throw new Error("Token issuer mismatch");
    }

    return payload;
  }

  /**
   * Extract scopes from a decoded JWT token.
   */
  private extractScopes(decoded: Record<string, unknown>): Set<string> {
    const scopes = new Set<string>();

    // Handle space-separated scope string (standard OAuth2)
    if (typeof decoded.scope === "string") {
      for (const scope of decoded.scope.split(" ")) {
        if (scope.trim()) {
          scopes.add(scope.trim());
        }
      }
    }

    // Handle scope array (some providers use this format)
    if (Array.isArray(decoded.scopes)) {
      for (const scope of decoded.scopes) {
        if (typeof scope === "string" && scope.trim()) {
          scopes.add(scope.trim());
        }
      }
    }

    // If no scopes found, return configured scopes for development
    if (scopes.size === 0) {
      return new Set(this.config.scopes);
    }

    return scopes;
  }

  /**
   * Create an authentication context from a token (for compatibility with existing middleware).
   */
  async createAuthContext(authorization: string): Promise<AuthContext> {
    if (!this.config.enabled) {
      return {
        authenticated: false,
        scopes: new Set(this.config.scopes),
      };
    }

    try {
      const match = authorization.match(/^Bearer\s+(.+)$/i);
      if (!match) {
        throw new Error("Invalid authorization header format");
      }

      const token = match[1];
      const authInfo = await this.verifyAccessToken(token);

      // Convert string scopes to McpScope and expand them
      const validScopes = authInfo.scopes.filter((scope): scope is McpScope =>
        this.config.scopes.includes(scope as McpScope),
      );
      const expandedScopes = expandScopes(validScopes);

      return {
        authenticated: true,
        scopes: expandedScopes,
        subject: authInfo.clientId,
      };
    } catch (error) {
      logger.debug(`Authentication failed: ${error}`);
      return {
        authenticated: false,
        scopes: new Set(),
      };
    }
  }
}
