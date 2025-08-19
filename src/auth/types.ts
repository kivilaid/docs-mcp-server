/**
 * OAuth2/OIDC authentication types and interfaces for MCP Authorization spec compliance.
 * Simplified to use binary authentication (authenticated vs not authenticated).
 */

/** Supported OAuth2 scopes (simplified to binary authentication) */
export type McpScope = "*";

/** OAuth2/OIDC authentication configuration */
export interface AuthConfig {
  /** Enable OAuth2/OIDC authentication */
  enabled: boolean;
  /** Issuer/discovery URL for the OAuth2/OIDC provider */
  issuerUrl?: string;
  /** JWT audience claim (identifies this protected resource) */
  audience?: string;
  /** Legacy field maintained for compatibility (not used in binary auth) */
  scopes: string[];
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
