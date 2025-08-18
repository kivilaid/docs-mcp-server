/**
 * OAuth2/OIDC authentication types and interfaces for MCP Authorization spec compliance.
 */

/** Supported OAuth2 scopes for MCP endpoints */
export type McpScope = "read:docs" | "write:docs" | "admin:jobs";

/** OAuth2/OIDC authentication configuration */
export interface AuthConfig {
  /** Enable OAuth2/OIDC authentication */
  enabled: boolean;
  /** Issuer/discovery URL for the OAuth2/OIDC provider */
  issuerUrl?: string;
  /** JWT audience claim (identifies this protected resource) */
  audience?: string;
  /** Enabled subset of supported scopes */
  scopes: McpScope[];
}

/** Decoded JWT token payload */
export interface DecodedToken {
  /** Token issuer */
  iss: string;
  /** Token audience */
  aud: string | string[];
  /** Token expiration time (Unix timestamp) */
  exp: number;
  /** Token issued at time (Unix timestamp) */
  iat: number;
  /** Token subject */
  sub: string;
  /** OAuth2 scopes granted to this token */
  scope?: string;
  /** Alternative scope format (array) */
  scopes?: string[];
}

/** Authentication context for requests */
export interface AuthContext {
  /** Whether the request is authenticated */
  authenticated: boolean;
  /** Effective scopes for the authenticated user */
  scopes: Set<McpScope>;
  /** Subject identifier from the token */
  subject?: string;
}

/** Scope validation result */
export interface ScopeValidationResult {
  /** Whether the required scopes are satisfied */
  authorized: boolean;
  /** Required scopes that are missing */
  missingScopes: McpScope[];
}

/** Protected resource metadata for RFC9728 compliance */
export interface ProtectedResourceMetadata {
  /** Resource identifier */
  resource: string;
  /** Array of authorization server URLs */
  authorization_servers: string[];
  /** Supported scopes */
  scopes_supported: string[];
  /** Human-readable resource name */
  resource_name: string;
  /** URL to resource documentation */
  resource_documentation?: string;
  /** Supported bearer token methods (RFC 9728) */
  bearer_methods_supported?: string[];
}

/** Error types for authentication failures */
export enum AuthErrorType {
  MISSING_TOKEN = "missing_token",
  INVALID_TOKEN = "invalid_token",
  EXPIRED_TOKEN = "expired_token",
  INVALID_AUDIENCE = "invalid_audience",
  INSUFFICIENT_SCOPE = "insufficient_scope",
  DISCOVERY_FAILED = "discovery_failed",
  INVALID_CONFIGURATION = "invalid_configuration",
}

/** Authentication error details */
export interface AuthError {
  type: AuthErrorType;
  message: string;
}
