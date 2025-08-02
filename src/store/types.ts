import type { ScrapeMode } from "../scraper/types";
import type { DocumentMetadata } from "../types";

/** Default vector dimension used across the application */
export const VECTOR_DIMENSION = 1536;

/**
 * Database document record type matching the documents table schema
 */
export interface DbDocument {
  id: string;
  library_id: number;
  version_id: number; // Changed from version: string to use foreign key
  url: string;
  content: string;
  metadata: string; // JSON string of DocumentMetadata
  embedding: string | null; // JSON string of number[]
  sort_order: number;
  score: number | null;
}

/**
 * Utility type for handling SQLite query results that may be undefined
 */
export type DbQueryResult<T> = T | undefined;

/**
 * Maps raw database document to the Document type used by the application
 */
export function mapDbDocumentToDocument(doc: DbDocument) {
  return {
    id: doc.id,
    pageContent: doc.content,
    metadata: JSON.parse(doc.metadata) as DocumentMetadata,
  };
}

/**
 * Search result type returned by the DocumentRetrieverService
 */
export interface StoreSearchResult {
  url: string;
  content: string;
  score: number | null;
}

/**
 * Represents the possible states of a version's indexing status.
 * These statuses are stored in the database and persist across server restarts.
 */
export enum VersionStatus {
  NOT_INDEXED = "not_indexed", // Version created but never indexed
  QUEUED = "queued", // Waiting in pipeline queue
  RUNNING = "running", // Currently being indexed
  COMPLETED = "completed", // Successfully indexed
  FAILED = "failed", // Indexing failed
  CANCELLED = "cancelled", // Indexing was cancelled
  UPDATING = "updating", // Re-indexing existing version
}

/**
 * Scraper options stored with each version for reproducible indexing.
 * Excludes runtime-only fields like signal, library, version, and url.
 */
export interface VersionScraperOptions {
  // Core scraping parameters
  maxPages?: number;
  maxDepth?: number;
  scope?: "subpages" | "hostname" | "domain";
  followRedirects?: boolean;
  maxConcurrency?: number;
  ignoreErrors?: boolean;

  // Content filtering
  excludeSelectors?: string[];
  includePatterns?: string[];
  excludePatterns?: string[];

  // Processing options
  scrapeMode?: ScrapeMode;
  headers?: Record<string, string>;
}

/**
 * Database version record type matching the versions table schema.
 * Uses snake_case naming to match database column names.
 */
export interface DbVersion {
  id: number;
  library_id: number;
  name: string | null; // NULL for unversioned content
  created_at: string;

  // Status tracking fields (added in migration 005)
  status: VersionStatus;
  progress_pages: number;
  progress_max_pages: number;
  error_message: string | null;
  started_at: string | null; // When the indexing job started
  updated_at: string;

  // Scraper options fields (added in migration 006)
  source_url: string | null; // Original scraping URL
  scraper_options: string | null; // JSON string of VersionScraperOptions
}

/**
 * Version record with library name included from JOIN query.
 * Used when we need both version data and the associated library name.
 */
export interface DbVersionWithLibrary extends DbVersion {
  library_name: string;
}

/**
 * Enhanced version record with computed statistics.
 * Used when we need both database fields and aggregated document stats.
 */
export interface VersionWithStats extends DbVersion {
  document_count: number;
  unique_url_count: number;
}

/**
 * API-friendly version details for external consumption.
 * Uses camelCase naming for API compatibility.
 */
export interface LibraryVersionDetails {
  version: string; // Normalized to empty string for unversioned
  documentCount: number;
  uniqueUrlCount: number;
  indexedAt: string | null; // ISO 8601 format
}

/**
 * Helper function to convert NULL version name to empty string for API compatibility.
 * Database stores NULL for unversioned content, but APIs expect empty string.
 */
export function normalizeVersionName(name: string | null): string {
  return name ?? "";
}

/**
 * Helper function to convert empty string to NULL for database storage.
 * APIs use empty string for unversioned content, but database stores NULL.
 */
export function denormalizeVersionName(name: string): string | null {
  return name === "" ? null : name;
}

/**
 * Result type for findBestVersion, indicating the best semver match
 * and whether unversioned documents exist.
 */
export interface FindVersionResult {
  bestMatch: string | null;
  hasUnversioned: boolean;
}

/**
 * Validates if a status transition is allowed.
 * Prevents invalid state changes and ensures data consistency.
 */
export function isValidStatusTransition(
  currentStatus: VersionStatus,
  newStatus: VersionStatus,
): boolean {
  // Define valid transitions for each status
  const validTransitions: Record<VersionStatus, VersionStatus[]> = {
    [VersionStatus.NOT_INDEXED]: [VersionStatus.QUEUED],
    [VersionStatus.QUEUED]: [VersionStatus.RUNNING, VersionStatus.CANCELLED],
    [VersionStatus.RUNNING]: [
      VersionStatus.COMPLETED,
      VersionStatus.FAILED,
      VersionStatus.CANCELLED,
    ],
    [VersionStatus.COMPLETED]: [VersionStatus.UPDATING],
    [VersionStatus.UPDATING]: [VersionStatus.RUNNING, VersionStatus.CANCELLED],
    [VersionStatus.FAILED]: [
      VersionStatus.QUEUED, // Allow retry
    ],
    [VersionStatus.CANCELLED]: [
      VersionStatus.QUEUED, // Allow retry
    ],
  };

  return validTransitions[currentStatus]?.includes(newStatus) ?? false;
}

/**
 * Gets a human-readable description of a version status.
 */
export function getStatusDescription(status: VersionStatus): string {
  const descriptions: Record<VersionStatus, string> = {
    [VersionStatus.NOT_INDEXED]: "Version created but not yet indexed",
    [VersionStatus.QUEUED]: "Waiting in queue for indexing",
    [VersionStatus.RUNNING]: "Currently being indexed",
    [VersionStatus.COMPLETED]: "Successfully indexed",
    [VersionStatus.FAILED]: "Indexing failed",
    [VersionStatus.CANCELLED]: "Indexing was cancelled",
    [VersionStatus.UPDATING]: "Re-indexing in progress",
  };

  return descriptions[status] || "Unknown status";
}

/**
 * Checks if a status represents a final state (job completed).
 */
export function isFinalStatus(status: VersionStatus): boolean {
  return [
    VersionStatus.COMPLETED,
    VersionStatus.FAILED,
    VersionStatus.CANCELLED,
  ].includes(status);
}

/**
 * Checks if a status represents an active state (job in progress).
 */
export function isActiveStatus(status: VersionStatus): boolean {
  return [VersionStatus.QUEUED, VersionStatus.RUNNING, VersionStatus.UPDATING].includes(
    status,
  );
}
