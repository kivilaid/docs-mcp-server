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
 * Represents a library and its indexed versions.
 */
export interface LibraryVersion {
  version: string;
}

/**
 * Database version record type matching the versions table schema
 */
export interface DbVersion {
  id: number;
  library_id: number;
  name: string | null; // NULL for unversioned content
  created_at: string;
  indexed_at: string | null;
}

/**
 * Detailed information about a specific indexed library version.
 * Combines database version info with aggregated document statistics.
 */
export interface VersionDetails {
  id: number;
  library_id: number;
  name: string | null; // NULL for unversioned, but exposed as string via API
  documentCount: number;
  uniqueUrlCount: number;
  indexedAt: string | null; // ISO 8601 format from MIN(indexed_at)
  createdAt: string;
}

/**
 * Detailed information about a specific indexed library version.
 * Maintains backward compatibility with existing API.
 */
export interface LibraryVersionDetails {
  version: string; // Normalized to empty string for unversioned
  documentCount: number;
  uniqueUrlCount: number;
  indexedAt: string | null; // ISO 8601 format from MIN(indexed_at)
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
