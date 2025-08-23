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
    const parsed = new URL(urlOrPath);
    return parsed.protocol.replace(":", "");
  } catch {
    // If URL parsing fails, check if it looks like a local file path
    if (urlOrPath.startsWith("/") || /^[A-Za-z]:/.test(urlOrPath)) {
      return "file";
    }
    return "unknown";
  }
}

/**
 * Sanitizes file paths to preserve structure while removing identifying details.
 * Examples:
 * - /Users/john/project/src/main.ts -> /[home]/[dir]/[dir]/[file].ts
 * - /var/lib/docs/react/hooks.md -> /[dir]/[dir]/[dir]/[file].md
 * - C:\Users\john\Documents\file.txt -> C:\[dir]\[dir]\[dir]\[file].txt
 */
export function sanitizePath(path: string): string {
  // Keep structure but remove specific names
  return path
    .replace(/\/[^/]+\.(js|ts|py|md|json|txt|html|css)$/i, "/[file].$1")
    .replace(/\\[^\\]+\.(js|ts|py|md|json|txt|html|css)$/i, "\\[file].$1")
    .replace(/^\/home\/[^/]+/, "/[home]")
    .replace(/^\/Users\/[^/]+/, "/[home]")
    .replace(/^C:\\Users\\[^\\]+/, "C:\\[home]")
    .replace(/\/[^/]+/g, "/[dir]")
    .replace(/\\[^\\]+/g, "\\[dir]");
}

/**
 * Extract hostname from URL
 * - https://docs.python.org/3/path -> "docs.python.org"
 * - file:///local/path -> "local"
 */

/**
 * Categorizes content size for analytics.
 * Examples:
 * - 500 bytes -> "tiny"
 * - 5KB -> "small"
 * - 50KB -> "medium"
 * - 500KB -> "large"
 * - 5MB -> "xlarge"
 */
export function categorizeContentSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return "tiny"; // < 1KB
  if (sizeBytes < 10240) return "small"; // < 10KB
  if (sizeBytes < 102400) return "medium"; // < 100KB
  if (sizeBytes < 1048576) return "large"; // < 1MB
  return "xlarge"; // >= 1MB
}

/**
 * Analyzes search query patterns without storing content.
 * Returns metadata about the query for usage analytics.
 */
export function analyzeSearchQuery(query: string): {
  length: number;
  wordCount: number;
  hasCodeTerms: boolean;
  hasSpecialChars: boolean;
  charset: "ascii" | "unicode" | "cjk" | "latin-extended";
} {
  return {
    length: query.length,
    wordCount: query.trim().split(/\s+/).length,
    hasCodeTerms:
      /\b(function|class|import|export|const|let|var|def|async|await)\b/i.test(query),
    hasSpecialChars: /[^\w\s]/.test(query),
    charset: detectCharset(query),
  };
}

/**
 * Detects character set of text for internationalization analytics.
 */
function detectCharset(text: string): "ascii" | "unicode" | "cjk" | "latin-extended" {
  // Test for ASCII characters only (printable range)
  if (/^[ -~]*$/.test(text)) return "ascii";
  // Test for CJK characters
  if (/[\u4e00-\u9fff]/.test(text)) return "cjk";
  // Test for Latin extended characters
  if (/[\u0080-\u024f]/.test(text)) return "latin-extended";
  return "unicode";
}

/**
 * Sanitizes error messages to remove sensitive information while preserving diagnostic value.
 * Examples:
 * - "Failed to fetch https://secret.com/api" -> "Failed to fetch [url]"
 * - "File not found: /home/user/secret.txt" -> "File not found: [path]"
 */
export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/https?:\/\/[^\s]+/gi, "[url]")
    .replace(/file:\/\/[^\s]+/gi, "[file-url]")
    .replace(/\/[^\s]*\.[a-z]{2,4}/gi, "[path]")
    .replace(/[A-Za-z]:\\[^\s]+/g, "[path]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [token]")
    .replace(/api[_-]?key[=:]\s*[^\s]+/gi, "api_key=[redacted]")
    .replace(/token[=:]\s*[^\s]+/gi, "token=[redacted]")
    .substring(0, 200); // Limit length
}

/**
 * Categorizes errors by type for analytics without exposing details.
 */
export function categorizeError(error: Error): string {
  const message = error.message.toLowerCase();
  if (message.includes("network") || message.includes("fetch")) return "network";
  if (message.includes("timeout")) return "timeout";
  if (message.includes("auth") || message.includes("permission")) return "auth";
  if (message.includes("parse") || message.includes("syntax")) return "parsing";
  if (message.includes("not found") || message.includes("404")) return "not_found";
  if (message.includes("database") || message.includes("sql")) return "database";
  if (message.includes("file") || message.includes("directory")) return "filesystem";
  return "unknown";
}

/**
 * Hashes sensitive strings for privacy-preserving analytics.
 * Use for deduplication without storing actual values.
 */
export function hashSensitiveString(input: string, prefix = "hash"): string {
  const hash = createHash("sha256").update(input).digest("hex").substring(0, 8);
  return `${prefix}_${hash}`;
}

/**
 * Extract CLI flags from process arguments for telemetry (without values)
 * Examples:
 * - ["--verbose", "--max-depth", "3"] -> ["--verbose", "--max-depth"]
 */
export function extractCliFlags(argv: string[]): string[] {
  return argv.filter((arg) => arg.startsWith("--") || arg.startsWith("-"));
}

/**
 * Sanitize job ID for telemetry while preserving structure
 */
export function sanitizeJobId(jobId: string): string {
  return hashSensitiveString(jobId, "job");
}

/**
 * Determine if an error is potentially recoverable
 */
export function isRecoverableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Network errors are often recoverable
  if (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("connection")
  ) {
    return true;
  }

  // Rate limiting is recoverable
  if (message.includes("rate limit") || message.includes("429")) {
    return true;
  }

  // Server errors might be recoverable
  if (message.includes("500") || message.includes("502") || message.includes("503")) {
    return true;
  }

  // Parsing errors, auth errors, not found errors are usually not recoverable
  return false;
}

/**
 * Check if a session should enable telemetry
 */
export function shouldEnableTelemetry(): boolean {
  // Check environment variable
  if (process.env.DOCS_MCP_TELEMETRY === "false") {
    return false;
  }

  // Check CLI flag
  if (process.argv.includes("--no-telemetry")) {
    return false;
  }

  // Default to enabled
  return true;
}

/**
 * Categorize user agent for analytics without storing full string
 */
export function categorizeUserAgent(userAgent: string): string {
  const ua = userAgent.toLowerCase();

  if (ua.includes("postman")) return "api_client_postman";
  if (ua.includes("insomnia")) return "api_client_insomnia";
  if (ua.includes("curl")) return "api_client_curl";
  if (ua.includes("wget")) return "api_client_wget";
  if (ua.includes("python-requests") || ua.includes("python/"))
    return "api_client_python";
  if (ua.includes("node-fetch") || ua.includes("node/")) return "api_client_node";

  if (ua.includes("chrome")) return "browser_chrome";
  if (ua.includes("firefox")) return "browser_firefox";
  if (ua.includes("safari")) return "browser_safari";
  if (ua.includes("edge")) return "browser_edge";

  if (ua.includes("mobile")) return "browser_mobile";
  if (ua.includes("bot") || ua.includes("crawler")) return "bot";

  return "other";
}
