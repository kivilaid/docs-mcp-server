import { describe, expect, it } from "vitest";
import {
  extractPathAndQuery,
  isRegexPattern,
  matchesAnyPattern,
  patternToRegExp,
  shouldIncludeUrl,
} from "./patternMatcher";

describe("patternMatcher", () => {
  it("isRegexPattern detects regex", () => {
    expect(isRegexPattern("/foo.*/")).toBe(true);
    expect(isRegexPattern("foo.*/")).toBe(false);
    expect(isRegexPattern("/foo.*/")).toBe(true);
    expect(isRegexPattern("foo.*")).toBe(false);
  });

  it("patternToRegExp auto-detects regex and glob", () => {
    expect(patternToRegExp("/foo.*/").test("foo123")).toBe(true);
    expect(patternToRegExp("foo*bar").test("fooxbar")).toBe(true);
    expect(patternToRegExp("foo*bar").test("fooyyybar")).toBe(true);
    expect(patternToRegExp("foo*bar").test("foo/bar")).toBe(false);
  });

  it("matchesAnyPattern works for globs and regex", () => {
    expect(matchesAnyPattern("foo/abc/bar", ["foo/*/bar"])).toBe(true);
    expect(matchesAnyPattern("foo/abc/bar", ["/foo/.*/bar/"])).toBe(true);
    expect(matchesAnyPattern("foo/abc/bar", ["baz/*"])).toBe(false);
  });

  it("extractPathAndQuery extracts path and query", () => {
    expect(extractPathAndQuery("https://example.com/foo/bar?x=1")).toBe("/foo/bar?x=1");
    expect(extractPathAndQuery("/foo/bar?x=1")).toBe("/foo/bar?x=1");
  });

  it("shouldIncludeUrl applies exclude over include", () => {
    // Exclude wins
    expect(shouldIncludeUrl("https://x.com/foo", ["foo*"], ["/foo/"])).toBe(false);
    // Include only
    expect(shouldIncludeUrl("https://x.com/foo", ["foo*"], undefined)).toBe(true);
    // No include/exclude
    expect(shouldIncludeUrl("https://x.com/foo", undefined, undefined)).toBe(true);
    // Exclude only
    expect(shouldIncludeUrl("https://x.com/foo", undefined, ["foo*"])).toBe(false);
  });

  describe("double asterisk (**) pattern matching", () => {
    it("should match files at any depth with **/filename pattern", () => {
      // Root level
      expect(matchesAnyPattern("/README.md", ["**/README.md"])).toBe(true);
      expect(matchesAnyPattern("/foo", ["**/foo"])).toBe(true);

      // Nested levels
      expect(matchesAnyPattern("/docs/README.md", ["**/README.md"])).toBe(true);
      expect(matchesAnyPattern("/docs/foo", ["**/foo"])).toBe(true);

      // Deep nested
      expect(matchesAnyPattern("/project/docs/sub/README.md", ["**/README.md"])).toBe(
        true,
      );
      expect(matchesAnyPattern("/project/docs/sub/foo", ["**/foo"])).toBe(true);

      // Should not match different filenames
      expect(matchesAnyPattern("/CHANGELOG.md", ["**/README.md"])).toBe(false);
      expect(matchesAnyPattern("/docs/bar", ["**/foo"])).toBe(false);
    });

    it("should work with shouldIncludeUrl for HTTP URLs", () => {
      // Root level matches
      expect(shouldIncludeUrl("https://example.com/foo", ["**/foo"])).toBe(true);
      expect(shouldIncludeUrl("https://example.com/README.md", ["**/README.md"])).toBe(
        true,
      );

      // Nested level matches
      expect(shouldIncludeUrl("https://example.com/docs/foo", ["**/foo"])).toBe(true);
      expect(
        shouldIncludeUrl("https://example.com/docs/README.md", ["**/README.md"]),
      ).toBe(true);

      // Deep nested matches
      expect(shouldIncludeUrl("https://example.com/docs/sub/foo", ["**/foo"])).toBe(true);
      expect(
        shouldIncludeUrl("https://example.com/project/docs/sub/README.md", [
          "**/README.md",
        ]),
      ).toBe(true);

      // No matches
      expect(shouldIncludeUrl("https://example.com/bar", ["**/foo"])).toBe(false);
      expect(
        shouldIncludeUrl("https://example.com/docs/CHANGELOG.md", ["**/README.md"]),
      ).toBe(false);
    });

    it("should work with file:// URLs and basename matching", () => {
      // file:// URLs get both path and basename matching
      expect(shouldIncludeUrl("file:///path/to/README.md", ["**/README.md"])).toBe(true);
      expect(shouldIncludeUrl("file:///path/to/README.md", ["README.md"])).toBe(true); // basename
      expect(shouldIncludeUrl("file:///project/docs/foo", ["**/foo"])).toBe(true);
      expect(shouldIncludeUrl("file:///project/docs/foo", ["foo"])).toBe(true); // basename
    });

    it("should support complex glob patterns with **", () => {
      // Directory wildcards
      expect(matchesAnyPattern("/docs/api/v1/spec.json", ["**/api/*/spec.json"])).toBe(
        true,
      );
      expect(
        matchesAnyPattern("/project/docs/api/v2/spec.json", ["**/api/*/spec.json"]),
      ).toBe(true);
      expect(matchesAnyPattern("/docs/api/spec.json", ["**/api/*/spec.json"])).toBe(
        false,
      ); // missing version

      // Extension wildcards
      expect(matchesAnyPattern("/docs/readme.md", ["**/readme.*"])).toBe(true);
      expect(matchesAnyPattern("/project/docs/readme.txt", ["**/readme.*"])).toBe(true);
      expect(matchesAnyPattern("/docs/changelog.md", ["**/readme.*"])).toBe(false);
    });

    it("should support directory-based patterns (foo/** and **/foo/**)", () => {
      // foo/** - matches foo directory at root level and anything under it
      expect(matchesAnyPattern("/foo/bar", ["foo/**"])).toBe(true);
      expect(matchesAnyPattern("/foo/bar/baz", ["foo/**"])).toBe(true);
      expect(matchesAnyPattern("/foo", ["foo/**"])).toBe(false); // foo itself, not under foo
      expect(matchesAnyPattern("/other/foo/bar", ["foo/**"])).toBe(false); // foo not at root

      // **/foo/** - matches foo directory anywhere and anything under it
      expect(matchesAnyPattern("/foo/bar", ["**/foo/**"])).toBe(true);
      expect(matchesAnyPattern("/docs/foo/bar", ["**/foo/**"])).toBe(true);
      expect(matchesAnyPattern("/project/docs/foo/baz", ["**/foo/**"])).toBe(true);
      expect(matchesAnyPattern("/foo", ["**/foo/**"])).toBe(false); // foo itself, not under foo
      expect(matchesAnyPattern("/docs/foo", ["**/foo/**"])).toBe(false); // foo itself, not under foo
      expect(matchesAnyPattern("/foobar/test", ["**/foo/**"])).toBe(false); // foobar != foo
    });

    it("should find shortest patterns for matching subdirectory foo", () => {
      // Different ways to match "foo" as a subdirectory component
      const testPath = "/project/docs/foo/readme.md";

      // Exact directory match anywhere: **/foo/**
      expect(matchesAnyPattern(testPath, ["**/foo/**"])).toBe(true);

      // Directory component match: */foo/* (single level before and after)
      expect(matchesAnyPattern("/docs/foo/readme.md", ["*/foo/*"])).toBe(true);
      expect(matchesAnyPattern(testPath, ["*/foo/*"])).toBe(false); // too many levels before

      // Multiple level variants
      expect(matchesAnyPattern(testPath, ["*/*/foo/*"])).toBe(true); // exactly 2 levels before, 1 after
      expect(matchesAnyPattern(testPath, ["**/foo/*"])).toBe(true); // any levels before, 1 after

      // Shortest universal pattern for "foo" directory anywhere: **/foo/**
      expect(matchesAnyPattern("/foo/", ["**/foo/**"])).toBe(true); // root level
      expect(matchesAnyPattern("/foo/bar", ["**/foo/**"])).toBe(true); // root level
      expect(matchesAnyPattern("/a/foo/bar", ["**/foo/**"])).toBe(true); // nested
      expect(matchesAnyPattern("/a/b/foo/c/d", ["**/foo/**"])).toBe(true); // deep nested
    });

    it("should demonstrate shortest patterns for common use cases", () => {
      // Shortest pattern to match any subdirectory named "foo": **/foo/**
      expect(shouldIncludeUrl("https://example.com/foo/index.html", ["**/foo/**"])).toBe(
        true,
      );
      expect(
        shouldIncludeUrl("https://example.com/src/foo/utils.js", ["**/foo/**"]),
      ).toBe(true);
      expect(
        shouldIncludeUrl("https://example.com/project/lib/foo/main.ts", ["**/foo/**"]),
      ).toBe(true);

      // Alternative patterns for different use cases
      expect(shouldIncludeUrl("https://example.com/foo", ["**/foo"])).toBe(true); // exact directory name
      expect(shouldIncludeUrl("https://example.com/foo/file", ["**/foo/**"])).toBe(true); // foo directory contents
      expect(shouldIncludeUrl("https://example.com/foobar", ["**/foo*"])).toBe(true); // starts with foo

      // Most specific: exact directory contents only **/foo/**
      expect(shouldIncludeUrl("https://example.com/foo", ["**/foo/**"])).toBe(false); // directory itself
      expect(shouldIncludeUrl("https://example.com/foobar", ["**/foo/**"])).toBe(false); // not exact match
    });

    it("should test URL patterns with directory matching", () => {
      const dirPatterns = ["**/docs/**", "**/api/**", "**/foo/**"];

      // Should match directory anywhere in URL path
      expect(shouldIncludeUrl("https://example.com/docs/guide.html", dirPatterns)).toBe(
        true,
      );
      expect(
        shouldIncludeUrl("https://example.com/project/docs/api.html", dirPatterns),
      ).toBe(true);
      expect(
        shouldIncludeUrl("https://example.com/v1/api/endpoints.json", dirPatterns),
      ).toBe(true);
      expect(shouldIncludeUrl("https://example.com/lib/foo/utils.js", dirPatterns)).toBe(
        true,
      );

      // Should not match directory name as part of filename
      expect(shouldIncludeUrl("https://example.com/myapi.html", dirPatterns)).toBe(false);
      expect(shouldIncludeUrl("https://example.com/foodocs.html", dirPatterns)).toBe(
        false,
      );

      // Should not match the directory itself (only contents under it)
      expect(shouldIncludeUrl("https://example.com/docs", dirPatterns)).toBe(false);
      expect(shouldIncludeUrl("https://example.com/project/api", dirPatterns)).toBe(
        false,
      );
    });
  });

  describe("pattern edge cases", () => {
    it("should handle patterns without leading/trailing slashes", () => {
      // Patterns without leading slash should still work
      expect(matchesAnyPattern("/docs/file.md", ["docs/file.md"])).toBe(true);
      expect(matchesAnyPattern("/docs/file.md", ["docs/*"])).toBe(true);

      // Multiple variations should work
      expect(shouldIncludeUrl("https://example.com/docs/file.md", ["docs/file.md"])).toBe(
        true,
      );
      // Note: /docs/file.md pattern expects exact match but URL has leading slash normalization
      expect(shouldIncludeUrl("https://example.com/docs/file.md", ["docs/file.md"])).toBe(
        true,
      );
    });

    it("should handle query parameters in URLs", () => {
      // Query parameters are included in the path for pattern matching
      expect(shouldIncludeUrl("https://example.com/docs/api?v=1", ["docs/*"])).toBe(true);
      expect(shouldIncludeUrl("https://example.com/docs/api?v=1", ["docs/api*"])).toBe(
        true,
      ); // * matches query
      expect(
        shouldIncludeUrl("https://example.com/docs/api?v=1&format=json", ["docs/api*"]),
      ).toBe(true);

      // **/api won't match because the path ends with "?v=1", not "api"
      expect(shouldIncludeUrl("https://example.com/docs/api?v=1", ["**/api"])).toBe(
        false,
      );
      // But this will match:
      expect(shouldIncludeUrl("https://example.com/docs/api", ["**/api"])).toBe(true); // no query params
      expect(shouldIncludeUrl("https://example.com/docs/api?v=1", ["**/api*"])).toBe(
        true,
      ); // wildcard after api
    });

    it("should handle multiple patterns (OR logic)", () => {
      const patterns = ["docs/*", "api/*", "**/README.md"];

      expect(shouldIncludeUrl("https://example.com/docs/guide", patterns)).toBe(true);
      expect(shouldIncludeUrl("https://example.com/api/v1", patterns)).toBe(true);
      expect(shouldIncludeUrl("https://example.com/project/README.md", patterns)).toBe(
        true,
      );
      expect(shouldIncludeUrl("https://example.com/other/file", patterns)).toBe(false);
    });

    it("should handle common documentation file patterns", () => {
      const docPatterns = [
        "**/README.md",
        "**/CHANGELOG.md",
        "**/package.json",
        "**/index.html",
      ];

      // Root level
      expect(shouldIncludeUrl("https://example.com/README.md", docPatterns)).toBe(true);
      expect(shouldIncludeUrl("https://example.com/package.json", docPatterns)).toBe(
        true,
      );

      // Nested
      expect(shouldIncludeUrl("https://example.com/docs/README.md", docPatterns)).toBe(
        true,
      );
      expect(
        shouldIncludeUrl("https://example.com/src/components/README.md", docPatterns),
      ).toBe(true);
      expect(shouldIncludeUrl("https://example.com/api/index.html", docPatterns)).toBe(
        true,
      );

      // Should not match
      expect(shouldIncludeUrl("https://example.com/src/code.js", docPatterns)).toBe(
        false,
      );
    });
  });

  describe("regex pattern behavior", () => {
    it("should handle regex patterns with ** equivalent", () => {
      // Regex equivalent of **/foo
      expect(shouldIncludeUrl("https://example.com/foo", ["/.*\\/foo$/"])).toBe(true);
      expect(shouldIncludeUrl("https://example.com/docs/foo", ["/.*\\/foo$/"])).toBe(
        true,
      );
      expect(shouldIncludeUrl("https://example.com/docs/sub/foo", ["/.*\\/foo$/"])).toBe(
        true,
      );

      // Should also match root level (no leading slash in path)
      expect(shouldIncludeUrl("https://example.com/foo", ["/.*foo$/"])).toBe(true);
    });

    it("should handle mixed glob and regex patterns", () => {
      const mixedPatterns = ["**/README.md", "/api\\/v\\d+/", "docs/*"];

      expect(shouldIncludeUrl("https://example.com/README.md", mixedPatterns)).toBe(true); // glob
      expect(shouldIncludeUrl("https://example.com/api/v1", mixedPatterns)).toBe(true); // regex
      expect(shouldIncludeUrl("https://example.com/docs/guide", mixedPatterns)).toBe(
        true,
      ); // glob
      expect(shouldIncludeUrl("https://example.com/other/file", mixedPatterns)).toBe(
        false,
      );
    });
  });
});
