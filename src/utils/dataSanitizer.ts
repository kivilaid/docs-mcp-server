/**
 * Data sanitization utilities for privacy-first telemetry.
 * Ensures no sensitive data (URLs, paths, queries, auth tokens) are collected.
 */

import { createHash } from "node:crypto";

/**
 * Sanitizes URLs to preserve structure while removing identifying details.
 * Examples:
 * - github.com/owner/repo -> https://github.com/[path]
 * - docs.python.org/3/library/os.html -> https://docs.python.org/[path]
 * - localhost:3000/api/search -> http://localhost/[path]
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Preserve useful structure while removing identifying details
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname && parsed.pathname !== "/" ? "/[path]" : ""}`;
  } catch {
    return "[invalid-url]";
  }
}

/**
 * Extracts domain from URL for aggregated analytics without exposing paths.
 * Examples:
 * - https://docs.python.org/3/library/os.html -> docs.python.org
 * - https://github.com/owner/repo -> github.com
 * - http://localhost:3000/api -> localhost
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return "invalid-domain";
  }
}

/**
 * Extracts protocol from URL or file path for privacy-safe analytics.
 * Examples:
 * - https://github.com/owner/repo -> "https"
 * - file:///local/path -> "file"
 * - /local/path -> "file" (detected as local file)
 * - C:\local\path -> "file" (detected as local file)
 */
export function extractProtocol(urlOrPath: string): string {
  try {
    // Check if it looks like a Windows path or Unix path first
    if (urlOrPath.match(/^[A-Z]:\\/) || urlOrPath.startsWith("/")) {
      return "file";
    }

    const parsed = new URL(urlOrPath);
    return parsed.protocol.replace(":", ""); // Remove trailing colon
  } catch {
    // If not a valid URL, assume it's a local file path
    return "file";
  }
}

/**
 * Analyzes search query patterns without storing actual content.
 * Returns metadata about the query structure for analytics.
 */
export function analyzeSearchQuery(query: string): {
  length: number;
  wordCount: number;
  hasCodeTerms: boolean;
  hasSpecialChars: boolean;
  charset: string;
} {
  return {
    length: query.length,
    wordCount: query.split(/\s+/).filter((w) => w.length > 0).length,
    hasCodeTerms: /\b(function|class|import|const|let|var|def|async|await)\b/i.test(
      query,
    ),
    hasSpecialChars: /[{}[\]().,;:]/.test(query),
    charset: detectCharset(query),
  };
}

/**
 * Detects character set of text for internationalization analytics.
 */
function detectCharset(text: string): string {
  // Check if text is pure ASCII
  if (text.split("").every((char) => char.charCodeAt(0) <= 127)) return "ascii";
  // Check for CJK characters
  if (/[\u4e00-\u9fff]/.test(text)) return "cjk";
  // Check for Latin extended characters
  if (/[\u0080-\u024f]/.test(text)) return "latin-extended";
  return "unicode";
}

/**
 * Sanitizes error objects to preserve diagnostic value while removing sensitive data.
 */
export function sanitizeError(error: Error): {
  type: string;
  category: string;
  recoverable: boolean;
  hasStack: boolean;
} {
  return {
    type: error.constructor.name,
    category: categorizeError(error),
    recoverable: isRecoverableError(error),
    hasStack: !!error.stack,
  };
}

/**
 * Categorizes errors into broad types for analytics without exposing details.
 */
export function categorizeError(error: Error): string {
  const message = error.message.toLowerCase();
  if (message.includes("network") || message.includes("fetch")) return "network";
  if (message.includes("timeout")) return "timeout";
  if (message.includes("auth") || message.includes("permission")) return "auth";
  if (message.includes("parse") || message.includes("syntax")) return "parsing";
  if (message.includes("not found") || message.includes("404")) return "not_found";
  return "unknown";
}

/**
 * Determines if an error is potentially recoverable for retry analytics.
 */
export function isRecoverableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  // Network errors are often recoverable
  if (message.includes("timeout") || message.includes("network")) return true;
  // Auth errors are usually not recoverable without user intervention
  if (message.includes("auth") || message.includes("unauthorized")) return false;
  // Parse errors are usually not recoverable
  if (message.includes("parse") || message.includes("syntax")) return false;
  // Default to recoverable for retry analytics
  return true;
}

/**
 * Sanitizes job ID to prevent exposure of sensitive identifiers.
 * Preserves uniqueness for tracking without exposing implementation details.
 */
export function sanitizeJobId(jobId: string): string {
  // Hash the job ID to preserve uniqueness while anonymizing
  return createHash("sha256").update(jobId).digest("hex").substring(0, 8);
}

/**
 * Extracts CLI flags from process arguments without their values.
 * Safe to track which flags are used without exposing sensitive values.
 */
export function extractCliFlags(args: string[]): string[] {
  return args
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => arg.split("=")[0]) // Remove values, keep flag names only
    .filter((flag) => !flag.includes("auth") && !flag.includes("token")); // Filter sensitive flags
}
