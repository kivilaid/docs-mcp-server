import type { DocumentMetadata } from "../types";

/** Default vector dimension used across the application */
export const VECTOR_DIMENSION = 1536;

/**
 * Database document record type matching the documents table schema
 */
export interface DbDocument {
  id: string;
  library_id: number;
  version: string;
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
 * Detailed information about a specific indexed library version.
 */
export interface LibraryVersionDetails {
  version: string;
  documentCount: number;
  uniqueUrlCount: number;
  indexedAt: string | null; // ISO 8601 format from MIN(indexed_at)
}

/**
 * Result type for findBestVersion, indicating the best semver match
 * and whether unversioned documents exist.
 */
export interface FindVersionResult {
  bestMatch: string | null;
  hasUnversioned: boolean;
}
