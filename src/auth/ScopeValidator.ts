/**
 * Scope validation utilities for MCP Authorization.
 * Handles scope inheritance and tool-to-scope mapping.
 */

import type { McpScope, ScopeValidationResult } from "./types";

/** All supported MCP scopes */
export const ALL_SCOPES: McpScope[] = ["read:docs", "write:docs", "admin:jobs"];

/** Scope inheritance mapping - higher scopes inherit lower scope permissions */
const SCOPE_INHERITANCE: Record<McpScope, McpScope[]> = {
  "read:docs": ["read:docs"],
  "write:docs": ["write:docs", "read:docs"],
  "admin:jobs": ["admin:jobs", "write:docs", "read:docs"],
};

/** Mapping of MCP tool methods to required scopes */
export const TOOL_SCOPE_MAP: Record<string, McpScope> = {
  // Read operations
  list_libraries: "read:docs",
  search_docs: "read:docs",
  fetch_url: "read:docs",
  find_version: "read:docs",
  get_job_info: "read:docs",
  list_jobs: "read:docs",

  // Write operations (content ingestion)
  scrape_docs: "write:docs",

  // Admin operations (destructive job operations)
  cancel_job: "admin:jobs",
  remove_docs: "admin:jobs",
  clear_completed_jobs: "admin:jobs",
};

/**
 * Expands a set of granted scopes to include all inherited permissions.
 * For example, "admin:jobs" expands to ["admin:jobs", "write:docs", "read:docs"]
 */
export function expandScopes(grantedScopes: string[]): Set<McpScope> {
  const expandedScopes = new Set<McpScope>();

  for (const scope of grantedScopes) {
    if (isValidScope(scope)) {
      const inheritedScopes = SCOPE_INHERITANCE[scope];
      for (const inheritedScope of inheritedScopes) {
        expandedScopes.add(inheritedScope);
      }
    }
  }

  return expandedScopes;
}

/**
 * Validates that a user has the required scope for a specific tool/method.
 */
export function validateToolAccess(
  method: string,
  userScopes: Set<McpScope>,
): ScopeValidationResult {
  const requiredScope = TOOL_SCOPE_MAP[method];

  if (!requiredScope) {
    // Unknown method - allow access (fail open for extensibility)
    return { authorized: true, missingScopes: [] };
  }

  if (userScopes.has(requiredScope)) {
    return { authorized: true, missingScopes: [] };
  }

  return {
    authorized: false,
    missingScopes: [requiredScope],
  };
}

/**
 * Validates that the required scopes are satisfied by the user's scopes.
 */
export function validateScopes(
  requiredScopes: McpScope[],
  userScopes: Set<McpScope>,
): ScopeValidationResult {
  const missingScopes: McpScope[] = [];

  for (const requiredScope of requiredScopes) {
    if (!userScopes.has(requiredScope)) {
      missingScopes.push(requiredScope);
    }
  }

  return {
    authorized: missingScopes.length === 0,
    missingScopes,
  };
}

/**
 * Type guard to check if a string is a valid MCP scope.
 */
export function isValidScope(scope: string): scope is McpScope {
  return ALL_SCOPES.includes(scope as McpScope);
}

/**
 * Validates that the provided scopes are a subset of supported scopes.
 */
export function validateScopeConfiguration(scopes: string[]): {
  valid: boolean;
  invalidScopes: string[];
} {
  const invalidScopes = scopes.filter((scope) => !isValidScope(scope));
  return {
    valid: invalidScopes.length === 0,
    invalidScopes,
  };
}
