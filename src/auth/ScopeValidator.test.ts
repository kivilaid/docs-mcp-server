/**
 * Unit tests for ScopeValidator utilities.
 */

import { describe, expect, it } from "vitest";
import {
  ALL_SCOPES,
  expandScopes,
  isValidScope,
  TOOL_SCOPE_MAP,
  validateScopeConfiguration,
  validateToolAccess,
} from "./ScopeValidator";
import type { McpScope } from "./types";

describe("ScopeValidator", () => {
  describe("isValidScope", () => {
    it("should validate known scopes", () => {
      expect(isValidScope("read:docs")).toBe(true);
      expect(isValidScope("write:docs")).toBe(true);
      expect(isValidScope("admin:jobs")).toBe(true);
    });

    it("should reject invalid scopes", () => {
      expect(isValidScope("invalid:scope")).toBe(false);
      expect(isValidScope("")).toBe(false);
      expect(isValidScope("read")).toBe(false);
    });
  });

  describe("expandScopes", () => {
    it("should expand read:docs scope", () => {
      const expanded = expandScopes(["read:docs"]);
      expect(expanded).toEqual(new Set(["read:docs"]));
    });

    it("should expand write:docs scope to include read:docs", () => {
      const expanded = expandScopes(["write:docs"]);
      expect(expanded).toEqual(new Set(["write:docs", "read:docs"]));
    });

    it("should expand admin:jobs scope to include all scopes", () => {
      const expanded = expandScopes(["admin:jobs"]);
      expect(expanded).toEqual(new Set(["admin:jobs", "write:docs", "read:docs"]));
    });

    it("should handle multiple scopes", () => {
      const expanded = expandScopes(["read:docs", "admin:jobs"]);
      expect(expanded).toEqual(new Set(["read:docs", "admin:jobs", "write:docs"]));
    });

    it("should ignore invalid scopes", () => {
      const expanded = expandScopes(["read:docs", "invalid:scope"]);
      expect(expanded).toEqual(new Set(["read:docs"]));
    });
  });

  describe("validateToolAccess", () => {
    it("should allow read operations with read:docs scope", () => {
      const userScopes = new Set<McpScope>(["read:docs"]);
      const result = validateToolAccess("list_libraries", userScopes);
      expect(result.authorized).toBe(true);
      expect(result.missingScopes).toEqual([]);
    });

    it("should deny write operations with only read:docs scope", () => {
      const userScopes = new Set<McpScope>(["read:docs"]);
      const result = validateToolAccess("scrape_docs", userScopes);
      expect(result.authorized).toBe(false);
      expect(result.missingScopes).toEqual(["write:docs"]);
    });

    it("should allow write operations with write:docs scope", () => {
      const userScopes = new Set<McpScope>(["write:docs", "read:docs"]);
      const result = validateToolAccess("scrape_docs", userScopes);
      expect(result.authorized).toBe(true);
      expect(result.missingScopes).toEqual([]);
    });

    it("should deny admin operations with only write scope", () => {
      const userScopes = new Set<McpScope>(["write:docs", "read:docs"]);
      const result = validateToolAccess("cancel_job", userScopes);
      expect(result.authorized).toBe(false);
      expect(result.missingScopes).toEqual(["admin:jobs"]);
    });

    it("should allow admin operations with admin:jobs scope", () => {
      const userScopes = new Set<McpScope>(["admin:jobs"]);
      const result = validateToolAccess("cancel_job", userScopes);
      expect(result.authorized).toBe(true);
      expect(result.missingScopes).toEqual([]);
    });

    it("should allow unknown methods (fail open)", () => {
      const userScopes = new Set<McpScope>(["read:docs"]);
      const result = validateToolAccess("unknown_method", userScopes);
      expect(result.authorized).toBe(true);
      expect(result.missingScopes).toEqual([]);
    });
  });

  describe("validateScopeConfiguration", () => {
    it("should validate valid scope configurations", () => {
      const result = validateScopeConfiguration(["read:docs", "write:docs"]);
      expect(result.valid).toBe(true);
      expect(result.invalidScopes).toEqual([]);
    });

    it("should reject invalid scope configurations", () => {
      const result = validateScopeConfiguration(["read:docs", "invalid:scope"]);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(["invalid:scope"]);
    });

    it("should handle empty scope list", () => {
      const result = validateScopeConfiguration([]);
      expect(result.valid).toBe(true);
      expect(result.invalidScopes).toEqual([]);
    });
  });

  describe("constants", () => {
    it("should export all supported scopes", () => {
      expect(ALL_SCOPES).toEqual(["read:docs", "write:docs", "admin:jobs"]);
    });

    it("should have tool scope mappings for all known tools", () => {
      // Read operations
      expect(TOOL_SCOPE_MAP.list_libraries).toBe("read:docs");
      expect(TOOL_SCOPE_MAP.search_docs).toBe("read:docs");
      expect(TOOL_SCOPE_MAP.fetch_url).toBe("read:docs");

      // Write operations
      expect(TOOL_SCOPE_MAP.scrape_docs).toBe("write:docs");

      // Admin operations
      expect(TOOL_SCOPE_MAP.cancel_job).toBe("admin:jobs");
      expect(TOOL_SCOPE_MAP.remove_docs).toBe("admin:jobs");
    });
  });
});
