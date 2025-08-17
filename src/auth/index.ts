/**
 * OAuth2/OIDC authentication module for MCP Authorization spec compliance.
 *
 * This module provides optional OAuth2/OIDC authentication for MCP endpoints
 * while keeping local usage frictionless (auth disabled by default).
 */

export { McpAuthManager } from "./McpAuthManager";
export { createAuthMiddleware, createScopeMiddleware } from "./middleware";
export {
  ALL_SCOPES,
  expandScopes,
  isValidScope,
  TOOL_SCOPE_MAP,
  validateScopeConfiguration,
  validateScopes,
  validateToolAccess,
} from "./ScopeValidator";
export type {
  AuthConfig,
  AuthContext,
  AuthError,
  DecodedToken,
  McpScope,
  ProtectedResourceMetadata,
  ScopeValidationResult,
} from "./types";
export { AuthErrorType } from "./types";
