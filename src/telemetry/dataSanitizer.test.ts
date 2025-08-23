/**
 * Tests for data sanitization utilities
 */

import { describe, expect, it } from "vitest";
import {
  analyzeSearchQuery,
  extractCliFlags,
  extractDomain,
  extractProtocol,
  sanitizeError,
  sanitizeJobId,
  sanitizeUrl,
} from "../utils/dataSanitizer";

describe("Data Sanitization", () => {
  describe("sanitizeUrl", () => {
    it("should sanitize GitHub URLs", () => {
      expect(sanitizeUrl("https://github.com/owner/repo")).toBe(
        "https://github.com/[path]",
      );
    });

    it("should sanitize documentation URLs", () => {
      expect(sanitizeUrl("https://docs.python.org/3/library/os.html")).toBe(
        "https://docs.python.org/[path]",
      );
    });

    it("should handle localhost URLs", () => {
      expect(sanitizeUrl("http://localhost:3000/api/search")).toBe(
        "http://localhost/[path]",
      );
    });

    it("should handle URLs without paths", () => {
      expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
    });

    it("should handle invalid URLs", () => {
      expect(sanitizeUrl("not-a-url")).toBe("[invalid-url]");
    });
  });

  describe("extractDomain", () => {
    it("should extract domain from valid URLs", () => {
      expect(extractDomain("https://docs.python.org/3/library/os.html")).toBe(
        "docs.python.org",
      );
      expect(extractDomain("https://github.com/owner/repo")).toBe("github.com");
      expect(extractDomain("http://localhost:3000/api")).toBe("localhost");
    });

    it("should handle invalid URLs", () => {
      expect(extractDomain("not-a-url")).toBe("invalid-domain");
    });
  });

  describe("extractProtocol", () => {
    it("should extract protocol from URLs", () => {
      expect(extractProtocol("https://github.com/owner/repo")).toBe("https");
      expect(extractProtocol("http://localhost:3000/api")).toBe("http");
      expect(extractProtocol("file:///local/path")).toBe("file");
    });

    it("should detect local file paths as file protocol", () => {
      expect(extractProtocol("/Users/john/project/src/main.ts")).toBe("file");
      expect(extractProtocol("C:\\Users\\john\\project")).toBe("file");
      expect(extractProtocol("/var/lib/docs/react/hooks.md")).toBe("file");
    });
  });

  describe("analyzeSearchQuery", () => {
    it("should analyze query structure", () => {
      const result = analyzeSearchQuery("async function fetchData");
      expect(result.length).toBe(24); // "async function fetchData".length
      expect(result.wordCount).toBe(3);
      expect(result.hasCodeTerms).toBe(true);
      expect(result.hasSpecialChars).toBe(false);
      expect(result.charset).toBe("ascii");
    });

    it("should detect special characters", () => {
      const result = analyzeSearchQuery("react.useState()");
      expect(result.hasSpecialChars).toBe(true);
    });
  });

  describe("sanitizeError", () => {
    it("should categorize network errors", () => {
      const error = new Error("Network timeout occurred");
      const result = sanitizeError(error);
      expect(result.type).toBe("Error");
      expect(result.category).toBe("network"); // Updated expectation
      expect(result.recoverable).toBe(true);
      expect(result.hasStack).toBe(true);
    });

    it("should categorize auth errors", () => {
      const error = new Error("Authentication failed");
      const result = sanitizeError(error);
      expect(result.category).toBe("auth");
      expect(result.recoverable).toBe(false);
    });
  });

  describe("sanitizeJobId", () => {
    it("should hash job IDs consistently", () => {
      const jobId = "job-12345-sensitive";
      const result1 = sanitizeJobId(jobId);
      const result2 = sanitizeJobId(jobId);

      expect(result1).toBe(result2);
      expect(result1).toHaveLength(8);
      expect(result1).not.toContain("sensitive");
    });
  });

  describe("extractCliFlags", () => {
    it("should extract CLI flags without values", () => {
      const args = [
        "node",
        "script.js",
        "--verbose",
        "--max-depth=3",
        "--auth-token=secret",
      ];
      const result = extractCliFlags(args);

      expect(result).toContain("--verbose");
      expect(result).toContain("--max-depth");
      expect(result).not.toContain("--auth-token"); // Filtered out
      expect(result).not.toContain("secret"); // Values removed
    });
  });
});
