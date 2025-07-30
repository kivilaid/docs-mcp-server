import type { Document } from "@langchain/core/documents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentStore } from "./DocumentStore";

// Mock only the embedding service to generate deterministic embeddings for testing
// This allows us to test ranking logic while using real SQLite database
vi.mock("./embeddings/EmbeddingFactory", () => ({
  createEmbeddingModel: () => ({
    embedQuery: vi.fn(async (text: string) => {
      // Generate deterministic embeddings based on text content for consistent testing
      const words = text.toLowerCase().split(/\s+/);
      const embedding = new Array(1536).fill(0);

      // Create meaningful semantic relationships for testing
      words.forEach((word, wordIndex) => {
        const wordHash = Array.from(word).reduce(
          (acc, char) => acc + char.charCodeAt(0),
          0,
        );
        const baseIndex = (wordHash % 100) * 15; // Distribute across embedding dimensions

        for (let i = 0; i < 15; i++) {
          const index = (baseIndex + i) % 1536;
          embedding[index] += 1.0 / (wordIndex + 1); // Earlier words get higher weight
        }
      });

      // Normalize the embedding
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      return magnitude > 0 ? embedding.map((val) => val / magnitude) : embedding;
    }),
    embedDocuments: vi.fn(async (texts: string[]) => {
      // Generate embeddings for each text using the same logic as embedQuery
      return texts.map((text) => {
        const words = text.toLowerCase().split(/\s+/);
        const embedding = new Array(1536).fill(0);

        words.forEach((word, wordIndex) => {
          const wordHash = Array.from(word).reduce(
            (acc, char) => acc + char.charCodeAt(0),
            0,
          );
          const baseIndex = (wordHash % 100) * 15;

          for (let i = 0; i < 15; i++) {
            const index = (baseIndex + i) % 1536;
            embedding[index] += 1.0 / (wordIndex + 1);
          }
        });

        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        return magnitude > 0 ? embedding.map((val) => val / magnitude) : embedding;
      });
    }),
  }),
}));

/**
 * Behavior-focused integration tests for DocumentStore
 * Uses real SQLite database with real migrations, but controlled embeddings for deterministic results
 */
describe("DocumentStore - Integration Tests", () => {
  let store: DocumentStore;

  beforeEach(async () => {
    // Create a fresh in-memory database for each test
    store = new DocumentStore(":memory:");
    await store.initialize();
  });

  afterEach(async () => {
    if (store) {
      await store.shutdown();
    }
  });

  describe("Document Storage and Retrieval", () => {
    it("should store and retrieve documents with proper metadata", async () => {
      const docs: Document[] = [
        {
          pageContent: "JavaScript programming tutorial with examples",
          metadata: {
            title: "JS Tutorial",
            url: "https://example.com/js-tutorial",
            path: ["programming", "javascript"],
          },
        },
        {
          pageContent: "Python data science guide with pandas",
          metadata: {
            title: "Python DS",
            url: "https://example.com/python-ds",
            path: ["programming", "python"],
          },
        },
      ];

      await store.addDocuments("testlib", "1.0.0", docs);

      // Verify documents were stored
      expect(await store.checkDocumentExists("testlib", "1.0.0")).toBe(true);

      // Verify library versions are tracked correctly
      const versions = await store.queryUniqueVersions("testlib");
      expect(versions).toContain("1.0.0");

      // Verify library version details
      const libraryVersions = await store.queryLibraryVersions();
      expect(libraryVersions.has("testlib")).toBe(true);

      const testlibVersions = libraryVersions.get("testlib")!;
      expect(testlibVersions).toHaveLength(1);
      expect(testlibVersions[0].version).toBe("1.0.0");
      expect(testlibVersions[0].documentCount).toBe(2);
      expect(testlibVersions[0].uniqueUrlCount).toBe(2);
    });

    it("should handle document deletion correctly", async () => {
      const docs: Document[] = [
        {
          pageContent: "Temporary document for deletion test",
          metadata: {
            title: "Temp Doc",
            url: "https://example.com/temp",
            path: ["temp"],
          },
        },
      ];

      await store.addDocuments("templib", "1.0.0", docs);
      expect(await store.checkDocumentExists("templib", "1.0.0")).toBe(true);

      const deletedCount = await store.deleteDocuments("templib", "1.0.0");
      expect(deletedCount).toBe(1);
      expect(await store.checkDocumentExists("templib", "1.0.0")).toBe(false);
    });

    it("should handle multiple versions of the same library", async () => {
      const v1Docs: Document[] = [
        {
          pageContent: "Version 1.0 feature documentation",
          metadata: {
            title: "V1 Features",
            url: "https://example.com/v1",
            path: ["features"],
          },
        },
      ];

      const v2Docs: Document[] = [
        {
          pageContent: "Version 2.0 feature documentation with new capabilities",
          metadata: {
            title: "V2 Features",
            url: "https://example.com/v2",
            path: ["features"],
          },
        },
      ];

      await store.addDocuments("versionlib", "1.0.0", v1Docs);
      await store.addDocuments("versionlib", "2.0.0", v2Docs);

      expect(await store.checkDocumentExists("versionlib", "1.0.0")).toBe(true);
      expect(await store.checkDocumentExists("versionlib", "2.0.0")).toBe(true);

      const versions = await store.queryUniqueVersions("versionlib");
      expect(versions).toContain("1.0.0");
      expect(versions).toContain("2.0.0");
    });
  });

  describe("Search Ranking and Hybrid Search Behavior", () => {
    beforeEach(async () => {
      // Set up test documents with known semantic relationships for ranking tests
      const docs: Document[] = [
        {
          pageContent: "JavaScript programming tutorial with code examples and functions",
          metadata: {
            title: "JavaScript Programming Guide",
            url: "https://example.com/js-guide",
            path: ["programming", "javascript"],
          },
        },
        {
          pageContent:
            "Advanced JavaScript frameworks like React and Vue for building applications",
          metadata: {
            title: "JavaScript Frameworks",
            url: "https://example.com/js-frameworks",
            path: ["programming", "javascript", "frameworks"],
          },
        },
        {
          pageContent:
            "Python programming language tutorial for data science and machine learning",
          metadata: {
            title: "Python Programming",
            url: "https://example.com/python-guide",
            path: ["programming", "python"],
          },
        },
        {
          pageContent: "Database design principles and SQL query optimization techniques",
          metadata: {
            title: "Database Design",
            url: "https://example.com/database-design",
            path: ["database", "design"],
          },
        },
        {
          pageContent: "Machine learning algorithms and neural networks in Python",
          metadata: {
            title: "Machine Learning Guide",
            url: "https://example.com/ml-guide",
            path: ["ai", "machine-learning"],
          },
        },
      ];

      await store.addDocuments("searchtest", "1.0.0", docs);
    });

    it("should rank documents by relevance to search query", async () => {
      const results = await store.findByContent(
        "searchtest",
        "1.0.0",
        "JavaScript programming",
        10,
      );

      expect(results.length).toBeGreaterThan(0);

      // JavaScript documents should rank higher than non-JavaScript documents
      const topResult = results[0];
      expect(topResult.pageContent.toLowerCase()).toContain("javascript");

      // Verify scores are in descending order (higher = better)
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].metadata.score).toBeGreaterThanOrEqual(
          results[i + 1].metadata.score,
        );
      }

      // All results should have valid RRF scores and ranking metadata
      for (const result of results) {
        expect(result.metadata.score).toBeGreaterThan(0);
        expect(typeof result.metadata.score).toBe("number");
        // Results may have either vec_rank, fts_rank, or both depending on match type
        expect(
          result.metadata.vec_rank !== undefined ||
            result.metadata.fts_rank !== undefined,
        ).toBe(true);
      }
    });

    it("should handle exact vs partial matches correctly", async () => {
      // Test exact phrase matching
      const exactResults = await store.findByContent(
        "searchtest",
        "1.0.0",
        "machine learning",
        10,
      );
      expect(exactResults.length).toBeGreaterThan(0);

      const topExactResult = exactResults[0];
      expect(topExactResult.pageContent.toLowerCase()).toContain("machine learning");

      // Test partial matching
      const partialResults = await store.findByContent(
        "searchtest",
        "1.0.0",
        "programming",
        10,
      );
      expect(partialResults.length).toBeGreaterThan(1); // Should match multiple docs

      // Both JavaScript and Python docs should appear in programming search
      const contentTexts = partialResults.map((r) => r.pageContent.toLowerCase());
      const hasJavaScript = contentTexts.some((text) => text.includes("javascript"));
      const hasPython = contentTexts.some((text) => text.includes("python"));
      expect(hasJavaScript && hasPython).toBe(true);
    });

    it("should properly escape and handle special characters in FTS queries", async () => {
      // These should not throw errors and should return valid results
      await expect(
        store.findByContent("searchtest", "1.0.0", '"JavaScript programming"', 10),
      ).resolves.toHaveProperty("length");

      await expect(
        store.findByContent("searchtest", "1.0.0", "programming AND tutorial", 10),
      ).resolves.toHaveProperty("length");

      await expect(
        store.findByContent("searchtest", "1.0.0", "function()", 10),
      ).resolves.toHaveProperty("length");

      await expect(
        store.findByContent("searchtest", "1.0.0", "framework*", 10),
      ).resolves.toHaveProperty("length");
    });

    it("should demonstrate RRF ranking combines vector and text search effectively", async () => {
      // Search for terms that should appear in multiple documents
      const results = await store.findByContent(
        "searchtest",
        "1.0.0",
        "programming tutorial",
        10,
      );

      expect(results.length).toBeGreaterThan(1);

      // Documents matching both terms should rank higher than single-term matches
      const topResult = results[0];
      const topContent = topResult.pageContent.toLowerCase();

      // Top result should contain both search terms or be highly semantically related
      const hasProgramming = topContent.includes("programming");
      const hasTutorial = topContent.includes("tutorial");
      const isJavaScriptDoc = topContent.includes("javascript"); // Highly relevant to programming

      expect(hasProgramming || hasTutorial || isJavaScriptDoc).toBe(true);

      // Verify that hybrid matches (both vector and FTS) get appropriate ranking
      const hybridResults = results.filter(
        (r) => r.metadata.vec_rank !== undefined && r.metadata.fts_rank !== undefined,
      );

      if (hybridResults.length > 0) {
        // Hybrid results should have competitive scores
        const hybridScores = hybridResults.map((r) => r.metadata.score);
        const maxHybridScore = Math.max(...hybridScores);
        const topScore = results[0].metadata.score;

        // At least one hybrid result should be competitive with the top result
        expect(maxHybridScore).toBeGreaterThan(topScore * 0.5); // Within 50% of top score
      }
    });

    it("should handle empty search results gracefully", async () => {
      const results = await store.findByContent("nonexistent", "1.0.0", "anything", 10);
      expect(results).toEqual([]);

      const results2 = await store.findByContent("searchtest", "99.0.0", "anything", 10);
      expect(results2).toEqual([]);
    });

    it("should respect search limits and return results in order", async () => {
      // Test with small limit
      const limitedResults = await store.findByContent(
        "searchtest",
        "1.0.0",
        "programming",
        2,
      );
      expect(limitedResults.length).toBeLessThanOrEqual(2);

      // Test with larger limit should return more results (if available)
      const allResults = await store.findByContent(
        "searchtest",
        "1.0.0",
        "programming",
        10,
      );
      expect(allResults.length).toBeGreaterThanOrEqual(limitedResults.length);

      // Limited results should be the top results from the full set
      if (limitedResults.length > 0 && allResults.length > limitedResults.length) {
        expect(limitedResults[0].metadata.score).toBe(allResults[0].metadata.score);
        if (limitedResults.length > 1) {
          expect(limitedResults[1].metadata.score).toBe(allResults[1].metadata.score);
        }
      }
    });
  });

  describe("Version Isolation", () => {
    it("should search within specific versions only", async () => {
      const docsV1: Document[] = [
        {
          pageContent: "Old feature documentation",
          metadata: {
            title: "Old Feature",
            url: "https://example.com/old",
            path: ["features"],
          },
        },
      ];

      const docsV2: Document[] = [
        {
          pageContent: "New feature documentation",
          metadata: {
            title: "New Feature",
            url: "https://example.com/new",
            path: ["features"],
          },
        },
      ];

      await store.addDocuments("featuretest", "1.0.0", docsV1);
      await store.addDocuments("featuretest", "2.0.0", docsV2);

      // Search in v1 should only return v1 docs
      const v1Results = await store.findByContent("featuretest", "1.0.0", "feature", 10);
      expect(v1Results.length).toBeGreaterThan(0);
      expect(v1Results[0].metadata.title).toBe("Old Feature");

      // Search in v2 should only return v2 docs
      const v2Results = await store.findByContent("featuretest", "2.0.0", "feature", 10);
      expect(v2Results.length).toBeGreaterThan(0);
      expect(v2Results[0].metadata.title).toBe("New Feature");
    });
  });

  describe("Document Retrieval by ID", () => {
    it("should retrieve documents by ID after storing them", async () => {
      const docs: Document[] = [
        {
          pageContent: "Test document for ID retrieval",
          metadata: {
            title: "ID Test Doc",
            url: "https://example.com/id-test",
            path: ["test"],
          },
        },
      ];

      await store.addDocuments("idtest", "1.0.0", docs);

      const results = await store.findByContent("idtest", "1.0.0", "test document", 10);
      expect(results.length).toBeGreaterThan(0);

      const doc = results[0];
      expect(doc.metadata.id).toBeDefined();

      // Retrieve by ID
      const retrievedDoc = await store.getById(doc.metadata.id);
      expect(retrievedDoc).not.toBeNull();
      expect(retrievedDoc?.metadata.title).toBe("ID Test Doc");
      expect(retrievedDoc?.pageContent).toBe("Test document for ID retrieval");
    });

    it("should return null for non-existent document IDs", async () => {
      const result = await store.getById("999999");
      expect(result).toBeNull();
    });

    it("should handle empty ID arrays gracefully", async () => {
      const results = await store.findChunksByIds("anylib", "1.0.0", []);
      expect(results).toEqual([]);
    });
  });
});
