import {
  type Mock,
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { VECTOR_DIMENSION } from "./types";

// --- Mocking Setup ---

// Mock the embedding factory
vi.mock("./embeddings/EmbeddingFactory");

// Mock embedding functions
const mockEmbedQuery = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
const mockEmbedDocuments = vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]);

import { createEmbeddingModel } from "./embeddings/EmbeddingFactory";
(createEmbeddingModel as Mock).mockReturnValue({
  embedQuery: vi.fn(),
  embedDocuments: vi.fn(),
});

/**
 * Initial generic mocks for better-sqlite3.
 * Will be replaced with dynamic mocks after vi.mock due to hoisting.
 */
const mockStatementAll = vi.fn().mockReturnValue([]);
const mockStatement = {
  all: mockStatementAll,
  run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 1 }),
  get: vi.fn().mockReturnValue(undefined),
};
let mockPrepare = vi.fn().mockReturnValue(mockStatement);
const mockDb = {
  prepare: (...args: unknown[]) => mockPrepare(...args),
  exec: vi.fn(),
  transaction: vi.fn(
    (fn) =>
      (...args: unknown[]) =>
        fn(...args),
  ),
  close: vi.fn(),
};
vi.mock("better-sqlite3", () => ({
  default: vi.fn(() => mockDb),
}));

/**
 * Simplified mockPrepare: always returns a generic statement object.
 * Test-specific SQL overrides are set up in each test/describe as needed.
 */
mockPrepare = vi.fn(() => ({
  get: vi.fn().mockReturnValue(undefined),
  run: vi.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
  all: mockStatementAll,
}));
mockDb.prepare = (...args: unknown[]) => mockPrepare(...args);

// Mock sqlite-vec
vi.mock("sqlite-vec", () => ({
  load: vi.fn(),
}));

// Mock the migration runner to prevent DB calls during init in tests
vi.mock("./applyMigrations", () => ({
  applyMigrations: vi.fn(), // Mock the exported function
}));

// --- Test Suite ---

// Import DocumentStore AFTER mocks are defined
import { DocumentStore } from "./DocumentStore";

describe("DocumentStore", () => {
  let documentStore: DocumentStore;

  beforeEach(async () => {
    vi.clearAllMocks(); // Clear call history etc.
    mockStatementAll.mockClear();
    mockStatementAll.mockReturnValue([]);

    // Reset the mock factory implementation for this test run
    (createEmbeddingModel as ReturnType<typeof vi.fn>).mockReturnValue({
      embedQuery: mockEmbedQuery,
      embedDocuments: mockEmbedDocuments,
    });
    // Reset embedQuery to handle initialization vector
    mockEmbedQuery.mockResolvedValue(new Array(VECTOR_DIMENSION).fill(0.1));

    // Now create the store and initialize.
    // initialize() will call 'new OpenAIEmbeddings()', which uses our fresh mock implementation.
    documentStore = new DocumentStore(":memory:");
    await documentStore.initialize();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe("findChunksByIds", () => {
    const library = "test-lib";
    const version = "1.0.0";

    it("should fetch and return documents for given IDs, sorted by sort_order", async () => {
      const ids = ["id1", "id2", "id3"];
      const mockRows = [
        {
          id: "id2",
          library,
          version,
          url: "url2",
          content: "content2",
          metadata: JSON.stringify({ url: "url2", score: 0.5 }),
          embedding: null,
          sort_order: 1,
          score: 0.5,
        },
        {
          id: "id1",
          library,
          version,
          url: "url1",
          content: "content1",
          metadata: JSON.stringify({ url: "url1", score: 0.9 }),
          embedding: null,
          sort_order: 0,
          score: 0.9,
        },
        {
          id: "id3",
          library,
          version,
          url: "url3",
          content: "content3",
          metadata: JSON.stringify({ url: "url3", score: 0.7 }),
          embedding: null,
          sort_order: 2,
          score: 0.7,
        },
      ];
      // Should be returned sorted by sort_order: id1, id2, id3
      mockStatementAll.mockReturnValueOnce([mockRows[1], mockRows[0], mockRows[2]]);
      const result = await documentStore.findChunksByIds(library, version, ids);
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining("id IN"));
      expect(mockStatementAll).toHaveBeenCalledWith(
        library.toLowerCase(),
        version.toLowerCase(),
        ...ids,
      );
      expect(result.length).toBe(3);
      expect(result[0].id).toBe("id1");
      expect(result[1].id).toBe("id2");
      expect(result[2].id).toBe("id3");
      expect(result[0].pageContent).toBe("content1");
      expect(result[1].pageContent).toBe("content2");
      expect(result[2].pageContent).toBe("content3");
    });

    it("should return an empty array if no IDs are provided", async () => {
      const prepareCallsBefore = mockPrepare.mock.calls.length;
      const allCallsBefore = mockStatementAll.mock.calls.length;
      const result = await documentStore.findChunksByIds(library, version, []);
      expect(result).toEqual([]);
      expect(mockPrepare.mock.calls.length).toBe(prepareCallsBefore);
      expect(mockStatementAll.mock.calls.length).toBe(allCallsBefore);
    });

    it("should return an empty array if no documents are found", async () => {
      mockStatementAll.mockReturnValueOnce([]);
      const result = await documentStore.findChunksByIds(library, version, ["idX"]);
      expect(result).toEqual([]);
      expect(mockPrepare).toHaveBeenCalled();
      expect(mockStatementAll).toHaveBeenCalled();
    });
  });

  describe("findByContent", () => {
    const library = "test-lib";
    const version = "1.0.0";
    const limit = 10;

    it("should call embedQuery and prepare/all with escaped FTS query for double quotes", async () => {
      const query = 'find "quotes"';
      const expectedFtsQuery = '"find ""quotes"""'; // Escaped and wrapped

      await documentStore.findByContent(library, version, query, limit);

      // 1. Check if embedQuery was called with correct args
      // Note: embedQuery is called twice - once during init and once for search
      const embedCalls = mockEmbedQuery.mock.calls;
      expect(embedCalls[embedCalls.length - 1][0]).toBe(query); // Last call should be our search

      // 2. Check if db.prepare was called correctly during findByContent
      // It's called multiple times during initialize, so check the specific call
      const prepareCall = mockPrepare.mock.calls.find((call) =>
        call[0].includes("WITH vec_distances AS"),
      );
      expect(prepareCall).toBeDefined();

      // 3. Check the arguments passed to the statement's 'all' method
      expect(mockStatementAll).toHaveBeenCalledTimes(1); // Only the findByContent call should use 'all'
      const lastCallArgs = mockStatementAll.mock.lastCall;
      expect(lastCallArgs).toEqual([
        library.toLowerCase(),
        version.toLowerCase(),
        expect.any(String), // Embedding JSON
        limit,
        library.toLowerCase(),
        version.toLowerCase(),
        expectedFtsQuery, // Check the escaped query string
        limit,
      ]);
    });

    it("should correctly escape FTS operators", async () => {
      const query = "search AND this OR that";
      const expectedFtsQuery = '"search AND this OR that"';
      await documentStore.findByContent(library, version, query, limit);
      expect(mockStatementAll).toHaveBeenCalledTimes(1);
      const lastCallArgs = mockStatementAll.mock.lastCall;
      expect(lastCallArgs?.[6]).toBe(expectedFtsQuery); // Check only the FTS query argument
    });

    it("should correctly escape parentheses", async () => {
      const query = "function(arg)";
      const expectedFtsQuery = '"function(arg)"';
      await documentStore.findByContent(library, version, query, limit);
      expect(mockStatementAll).toHaveBeenCalledTimes(1);
      const lastCallArgs = mockStatementAll.mock.lastCall;
      expect(lastCallArgs?.[6]).toBe(expectedFtsQuery);
    });

    it("should correctly escape asterisks", async () => {
      const query = "wildcard*";
      const expectedFtsQuery = '"wildcard*"';
      await documentStore.findByContent(library, version, query, limit);
      expect(mockStatementAll).toHaveBeenCalledTimes(1);
      const lastCallArgs = mockStatementAll.mock.lastCall;
      expect(lastCallArgs?.[6]).toBe(expectedFtsQuery);
    });

    it("should correctly escape already quoted strings", async () => {
      const query = '"already quoted"';
      const expectedFtsQuery = '"""already quoted"""';
      await documentStore.findByContent(library, version, query, limit);
      expect(mockStatementAll).toHaveBeenCalledTimes(1);
      const lastCallArgs = mockStatementAll.mock.lastCall;
      expect(lastCallArgs?.[6]).toBe(expectedFtsQuery);
    });

    it("should correctly handle empty string", async () => {
      const query = "";
      const expectedFtsQuery = '""';
      await documentStore.findByContent(library, version, query, limit);
      expect(mockStatementAll).toHaveBeenCalledTimes(1);
      const lastCallArgs = mockStatementAll.mock.lastCall;
      expect(lastCallArgs?.[6]).toBe(expectedFtsQuery);
    });
  });

  describe("addDocuments - Batching", () => {
    it("should process embeddings in batches when document count exceeds EMBEDDING_BATCH_SIZE", async () => {
      const { EMBEDDING_BATCH_SIZE } = await import("../utils/config");
      const numDocuments = EMBEDDING_BATCH_SIZE + 5;
      const documents = Array.from({ length: numDocuments }, (_, i) => ({
        pageContent: `doc${i + 1} text`,
        metadata: { title: `t${i + 1}`, url: `u1/${i + 1}`, path: [`p${i + 1}`] },
      }));

      const mockEmbeddingDim = VECTOR_DIMENSION;
      const firstBatchEmbeddings = Array.from({ length: EMBEDDING_BATCH_SIZE }, () =>
        new Array(mockEmbeddingDim).fill(0.1),
      );
      const secondBatchEmbeddings = Array.from(
        { length: numDocuments - EMBEDDING_BATCH_SIZE },
        () => new Array(mockEmbeddingDim).fill(0.2),
      );

      mockEmbedDocuments
        .mockResolvedValueOnce(firstBatchEmbeddings)
        .mockResolvedValueOnce(secondBatchEmbeddings);

      // Patch mockPrepare for this test to handle library id resolution for test-lib-large-batch
      const originalMockPrepare = mockPrepare;
      mockPrepare = vi.fn((sql: string) => {
        if (sql.includes("SELECT id FROM libraries WHERE name = ?")) {
          return {
            get: (name: string) =>
              name === "test-lib-large-batch" ? { id: 1 } : undefined,
            run: vi.fn(),
            all: mockStatementAll,
          };
        }
        if (sql.includes("INSERT INTO libraries")) {
          return {
            run: vi.fn(),
            get: vi.fn(),
            all: mockStatementAll,
          };
        }
        return originalMockPrepare(sql);
      });
      mockDb.prepare = (...args: unknown[]) => mockPrepare(...args);

      // Re-instantiate DocumentStore after patching mockPrepare
      documentStore = new DocumentStore(":memory:");
      await documentStore.initialize();

      await documentStore.addDocuments("test-lib-large-batch", "1.0.0", documents);

      expect(mockEmbedDocuments).toHaveBeenCalledTimes(2);
      expect((mockEmbedDocuments.mock.calls[0][0] as string[]).length).toBe(
        EMBEDDING_BATCH_SIZE,
      );
      expect((mockEmbedDocuments.mock.calls[1][0] as string[]).length).toBe(
        numDocuments - EMBEDDING_BATCH_SIZE,
      );
    });
  });

  describe("Embedding Model Dimensions", () => {
    let getLibraryIdByNameMock: Mock;
    let insertLibraryMock: Mock;
    let lastInsertedVector: number[];

    beforeEach(() => {
      getLibraryIdByNameMock = vi.fn().mockReturnValue({ id: 1 });
      insertLibraryMock = vi.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 });
      lastInsertedVector = [];

      mockPrepare.mockImplementation((sql: string) => {
        if (sql.includes("SELECT id FROM libraries WHERE name = ?")) {
          return {
            get: getLibraryIdByNameMock,
            run: vi.fn(),
            all: mockStatementAll,
          };
        }
        if (sql.includes("INSERT INTO libraries")) {
          return {
            run: insertLibraryMock,
            get: vi.fn(),
            all: mockStatementAll,
          };
        }
        if (sql.includes("INSERT INTO documents_vec")) {
          return {
            run: vi.fn((...args) => {
              if (typeof args[3] === "string") {
                try {
                  const arr = JSON.parse(args[3]);
                  if (Array.isArray(arr)) lastInsertedVector = arr;
                } catch {}
              }
              return { changes: 1, lastInsertRowid: 1 };
            }),
            get: vi.fn(),
            all: mockStatementAll,
          };
        }
        return {
          get: vi.fn(),
          run: vi.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
          all: mockStatementAll,
        };
      });
    });

    afterEach(() => {
      mockPrepare.mockImplementation(() => ({
        get: vi.fn().mockReturnValue(undefined),
        run: vi.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
        all: mockStatementAll,
      }));
    });

    it("should accept a model that produces ${VECTOR_DIMENSION}-dimensional vectors", async () => {
      mockEmbedQuery.mockResolvedValueOnce(new Array(VECTOR_DIMENSION).fill(0.1));
      documentStore = new DocumentStore(":memory:");
      await expect(documentStore.initialize()).resolves.not.toThrow();
    });

    it("should accept and pad vectors from models with smaller dimensions", async () => {
      mockEmbedQuery.mockResolvedValueOnce(new Array(768).fill(0.1));
      mockEmbedDocuments.mockResolvedValueOnce([new Array(768).fill(0.1)]);

      documentStore = new DocumentStore(":memory:");
      await documentStore.initialize();

      const doc = {
        pageContent: "test content",
        metadata: { title: "test", url: "http://test.com", path: ["test"] },
      };

      await expect(
        documentStore.addDocuments("test-lib", "1.0.0", [doc]),
      ).resolves.not.toThrow();
    });

    it("should reject models that produce vectors larger than ${VECTOR_DIMENSION} dimensions", async () => {
      mockEmbedQuery.mockResolvedValueOnce(new Array(3072).fill(0.1));
      documentStore = new DocumentStore(":memory:");
      await expect(documentStore.initialize()).rejects.toThrow(
        new RegExp(`exceeds.*${VECTOR_DIMENSION}`),
      );
    });

    it("should pad both document and query vectors consistently", async () => {
      const smallVector = new Array(768).fill(0.1);
      mockEmbedQuery
        .mockResolvedValueOnce(smallVector)
        .mockResolvedValueOnce(smallVector);
      mockEmbedDocuments.mockResolvedValueOnce([smallVector]);

      documentStore = new DocumentStore(":memory:");
      await documentStore.initialize();

      const doc = {
        pageContent: "test content",
        metadata: { title: "test", url: "http://test.com", path: ["test"] },
      };

      mockStatementAll.mockImplementationOnce(() => [
        {
          id: "id1",
          content: "content",
          metadata: JSON.stringify({}),
          vec_score: 1,
          fts_score: 1,
        },
      ]);

      await documentStore.addDocuments("test-lib", "1.0.0", [doc]);

      await expect(
        documentStore.findByContent("test-lib", "1.0.0", "test query", 5),
      ).resolves.not.toThrow();

      const searchCall = mockStatementAll.mock.lastCall;
      const searchVector = JSON.parse(searchCall?.[2] || "[]");

      expect(lastInsertedVector.length).toBe(VECTOR_DIMENSION);
      expect(searchVector.length).toBe(VECTOR_DIMENSION);
    });
  });

  describe("Vector Similarity Scoring", () => {
    it("should order documents by vector similarity distance (vector-only search)", async () => {
      // Mock library lookup for test
      const getLibraryIdMock = vi.fn().mockReturnValue({ id: 1 });
      mockPrepare.mockImplementation((sql: string) => {
        if (sql.includes("SELECT id FROM libraries WHERE name = ?")) {
          return { get: getLibraryIdMock, run: vi.fn(), all: mockStatementAll };
        }
        if (sql.includes("INSERT INTO libraries")) {
          return { run: vi.fn(), get: vi.fn(), all: mockStatementAll };
        }
        // Match the actual hybrid search query pattern
        if (
          sql.includes("WITH vec_distances AS") &&
          sql.includes("dv.embedding MATCH ?")
        ) {
          return { get: vi.fn(), run: vi.fn(), all: mockStatementAll };
        }
        return {
          get: vi.fn(),
          run: vi.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
          all: mockStatementAll,
        };
      });

      // Mock vector search results - ordered by distance (closer = smaller distance)
      const mockVectorResults = [
        {
          id: "doc1",
          content: "very similar content",
          metadata: JSON.stringify({
            title: "Similar Doc",
            url: "url1",
            path: ["path1"],
          }),
          vec_score: 0.1, // Very close to search vector
          fts_score: 0.9, // Also good FTS score
        },
        {
          id: "doc2",
          content: "somewhat similar content",
          metadata: JSON.stringify({
            title: "Somewhat Doc",
            url: "url2",
            path: ["path2"],
          }),
          vec_score: 0.5, // Moderately close
          fts_score: 0.5, // Medium FTS score
        },
        {
          id: "doc3",
          content: "different content",
          metadata: JSON.stringify({
            title: "Different Doc",
            url: "url3",
            path: ["path3"],
          }),
          vec_score: 0.9, // Far from search vector
          fts_score: 0.1, // Poor FTS score
        },
      ];

      mockStatementAll.mockReturnValueOnce(mockVectorResults);

      // Mock the embedQuery to return a search vector
      const searchVector = new Array(VECTOR_DIMENSION).fill(0.1);
      mockEmbedQuery.mockResolvedValueOnce(searchVector);

      // Create a new store instance for this test
      documentStore = new DocumentStore(":memory:");
      await documentStore.initialize();

      // Perform search which will use the hybrid query
      const result = await documentStore.findByContent(
        "test-lib",
        "1.0.0",
        "test query",
        10,
      );

      // Verify embedQuery was called for the search vector
      expect(mockEmbedQuery).toHaveBeenCalledWith("test query");

      // Verify the vector search SQL query was executed
      expect(mockStatementAll).toHaveBeenCalled();
      const sqlCall = mockPrepare.mock.calls.find(
        (call) =>
          call[0].includes("WITH vec_distances AS") &&
          call[0].includes("dv.embedding MATCH ?"),
      );
      expect(sqlCall).toBeDefined();

      // Verify results are ordered by RRF score (highest first)
      // Note: The actual ordering depends on RRF calculation from combined ranks
      expect(result).toHaveLength(3);

      // Verify that results have score metadata attached
      expect(result[0].metadata.score).toBeDefined();
      expect(result[0].metadata.vec_rank).toBeDefined();
      expect(result[0].metadata.fts_rank).toBeDefined();

      // Verify scores are in descending order (highest first)
      expect(result[0].metadata.score).toBeGreaterThanOrEqual(result[1].metadata.score);
      expect(result[1].metadata.score).toBeGreaterThanOrEqual(result[2].metadata.score);

      // Verify the search vector was passed to the query
      const lastCall = mockStatementAll.mock.lastCall;
      expect(lastCall).toContain(JSON.stringify(searchVector));
    });
  });

  describe("End-to-End Result Ordering", () => {
    it("should return final results ordered by RRF score (highest first)", async () => {
      // Mock library lookup for test
      const getLibraryIdMock = vi.fn().mockReturnValue({ id: 1 });
      mockPrepare.mockImplementation((sql: string) => {
        if (sql.includes("SELECT id FROM libraries WHERE name = ?")) {
          return { get: getLibraryIdMock, run: vi.fn(), all: mockStatementAll };
        }
        if (sql.includes("INSERT INTO libraries")) {
          return { run: vi.fn(), get: vi.fn(), all: mockStatementAll };
        }
        if (
          sql.includes("WITH vec_distances AS") &&
          sql.includes("dv.embedding MATCH ?")
        ) {
          return { get: vi.fn(), run: vi.fn(), all: mockStatementAll };
        }
        return {
          get: vi.fn(),
          run: vi.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
          all: mockStatementAll,
        };
      });

      // Mock search results with clear RRF score differences
      const mockSearchResults = [
        {
          id: "3",
          content: "worst match",
          metadata: JSON.stringify({ title: "Worst Doc", url: "url3", path: ["path3"] }),
          vec_score: 0.2, // Poor vector score
          fts_score: 0.2, // Poor FTS score -> both get rank 3 -> RRF = 2*(1/63) ≈ 0.032
        },
        {
          id: "1",
          content: "best match",
          metadata: JSON.stringify({ title: "Best Doc", url: "url1", path: ["path1"] }),
          vec_score: 0.9, // Excellent vector score
          fts_score: 0.9, // Excellent FTS score -> both get rank 1 -> RRF = 2*(1/61) ≈ 0.033
        },
        {
          id: "2",
          content: "medium match",
          metadata: JSON.stringify({ title: "Medium Doc", url: "url2", path: ["path2"] }),
          vec_score: 0.6, // Medium vector score
          fts_score: 0.6, // Medium FTS score -> both get rank 2 -> RRF = 2*(1/62) ≈ 0.032
        },
      ];

      mockStatementAll.mockReturnValueOnce(mockSearchResults);
      mockEmbedQuery.mockResolvedValueOnce(new Array(VECTOR_DIMENSION).fill(0.1));

      documentStore = new DocumentStore(":memory:");
      await documentStore.initialize();

      const result = await documentStore.findByContent(
        "test-lib",
        "1.0.0",
        "test query",
        10,
      );

      // Verify results are ordered correctly: Best, Medium, Worst
      expect(result).toHaveLength(3);
      expect(result[0].metadata.title).toBe("Best Doc"); // Highest RRF score
      expect(result[1].metadata.title).toBe("Medium Doc"); // Medium RRF score
      expect(result[2].metadata.title).toBe("Worst Doc"); // Lowest RRF score

      // Verify RRF scores are in descending order
      expect(result[0].metadata.score).toBeGreaterThan(result[1].metadata.score);
      expect(result[1].metadata.score).toBeGreaterThan(result[2].metadata.score);

      // Verify score values are reasonable (around 0.03)
      expect(result[0].metadata.score).toBeCloseTo(0.033, 2);
      expect(result[1].metadata.score).toBeCloseTo(0.032, 2);
      expect(result[2].metadata.score).toBeCloseTo(0.032, 2);
    });
  });

  describe("queryLibraryVersions", () => {
    it("should return a map of libraries to their detailed versions", async () => {
      const mockData = [
        {
          library: "react",
          version: "18.2.0",
          documentCount: 150,
          uniqueUrlCount: 50,
          indexedAt: "2024-01-10T10:00:00.000Z",
        },
        {
          library: "react",
          version: "17.0.1",
          documentCount: 120,
          uniqueUrlCount: 45,
          indexedAt: "2023-05-15T12:30:00.000Z",
        },
        {
          library: "vue",
          version: "3.3.0",
          documentCount: 200,
          uniqueUrlCount: 70,
          indexedAt: "2024-02-20T08:00:00.000Z",
        },
        {
          library: "react",
          version: "", // Internal empty version, should be filtered out
          documentCount: 5,
          uniqueUrlCount: 1,
          indexedAt: "2023-01-01T00:00:00.000Z",
        },
        {
          library: "old-lib",
          version: "1.0.0",
          documentCount: 10,
          uniqueUrlCount: 5,
          indexedAt: null, // Test null indexedAt
        },
        {
          library: "unversioned-only", // Test lib with only unversioned
          version: "",
          documentCount: 1,
          uniqueUrlCount: 1,
          indexedAt: "2024-04-01T00:00:00.000Z",
        },
        {
          library: "mixed-versions", // Test lib with semver and unversioned
          version: "1.0.0",
          documentCount: 5,
          uniqueUrlCount: 2,
          indexedAt: "2024-04-02T00:00:00.000Z",
        },
        {
          library: "mixed-versions", // Test lib with semver and unversioned
          version: "",
          documentCount: 2,
          uniqueUrlCount: 1,
          indexedAt: "2024-04-03T00:00:00.000Z",
        },
      ];
      mockStatementAll.mockReturnValue(mockData); // Configure mock return for this test

      const result = await documentStore.queryLibraryVersions();

      // Check the prepared statement was called
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining("GROUP BY l.name, d.version"),
      );
      expect(mockStatementAll).toHaveBeenCalledTimes(1);

      // Check the structure and content
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(5); // react, vue, old-lib, unversioned-only, mixed-versions

      // Check React versions (should include "" sorted first)
      const reactVersions = result.get("react");
      expect(reactVersions).toBeDefined();
      expect(reactVersions?.length).toBe(3); // Expect 3 versions now
      expect(reactVersions?.[0]).toEqual({
        // Unversioned first
        version: "",
        documentCount: 5,
        uniqueUrlCount: 1,
        indexedAt: new Date("2023-01-01T00:00:00.000Z").toISOString(),
      });
      expect(reactVersions?.[1]).toEqual({
        // Then 17.0.1
        version: "17.0.1",
        documentCount: 120,
        uniqueUrlCount: 45,
        indexedAt: new Date("2023-05-15T12:30:00.000Z").toISOString(),
      });
      expect(reactVersions?.[2]).toEqual({
        // Then 18.2.0
        version: "18.2.0",
        documentCount: 150,
        uniqueUrlCount: 50,
        indexedAt: new Date("2024-01-10T10:00:00.000Z").toISOString(),
      });

      // Check Vue version
      const vueVersions = result.get("vue");
      expect(vueVersions).toBeDefined();
      expect(vueVersions?.length).toBe(1);
      expect(vueVersions?.[0]).toEqual({
        version: "3.3.0",
        documentCount: 200,
        uniqueUrlCount: 70,
        indexedAt: new Date("2024-02-20T08:00:00.000Z").toISOString(),
      });

      // Check Old Lib version (with null indexedAt)
      const oldLibVersions = result.get("old-lib");
      expect(oldLibVersions).toBeDefined();
      expect(oldLibVersions?.length).toBe(1);
      expect(oldLibVersions?.[0]).toEqual({
        version: "1.0.0",
        documentCount: 10,
        uniqueUrlCount: 5,
        indexedAt: null,
      });

      // Check Unversioned Only lib
      const unversionedOnly = result.get("unversioned-only");
      expect(unversionedOnly).toBeDefined();
      expect(unversionedOnly?.length).toBe(1);
      expect(unversionedOnly?.[0]).toEqual({
        version: "", // Expect empty string version
        documentCount: 1,
        uniqueUrlCount: 1,
        indexedAt: new Date("2024-04-01T00:00:00.000Z").toISOString(),
      });

      // Check Mixed Versions lib (should include "" and be sorted)
      const mixedVersions = result.get("mixed-versions");
      expect(mixedVersions).toBeDefined();
      expect(mixedVersions?.length).toBe(2);
      // Empty string version should come first due to semver compare treating it lowest
      expect(mixedVersions?.[0]).toEqual({
        version: "",
        documentCount: 2,
        uniqueUrlCount: 1,
        indexedAt: new Date("2024-04-03T00:00:00.000Z").toISOString(),
      });
      expect(mixedVersions?.[1]).toEqual({
        version: "1.0.0",
        documentCount: 5,
        uniqueUrlCount: 2,
        indexedAt: new Date("2024-04-02T00:00:00.000Z").toISOString(),
      });
    });

    it("should return an empty map if no libraries are found", async () => {
      mockStatementAll.mockReturnValue([]); // No data
      const result = await documentStore.queryLibraryVersions();
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });

  describe("RRF Ranking Algorithm", () => {
    // Access private methods for testing
    const getPrivateMethod = (obj: any, methodName: string) => obj[methodName].bind(obj);

    it("should calculate correct RRF scores for vector-only results", async () => {
      const calculateRRF = getPrivateMethod(documentStore, "calculateRRF");

      // Test vector-only results with different ranks
      expect(calculateRRF(1, undefined)).toBeCloseTo(1 / (60 + 1)); // ~0.0164
      expect(calculateRRF(2, undefined)).toBeCloseTo(1 / (60 + 2)); // ~0.0161
      expect(calculateRRF(3, undefined)).toBeCloseTo(1 / (60 + 3)); // ~0.0159

      // Better vector rank should produce higher RRF score
      expect(calculateRRF(1, undefined)).toBeGreaterThan(calculateRRF(2, undefined));
      expect(calculateRRF(2, undefined)).toBeGreaterThan(calculateRRF(3, undefined));
    });

    it("should calculate correct RRF scores for FTS-only results", async () => {
      const calculateRRF = getPrivateMethod(documentStore, "calculateRRF");

      // Test FTS-only results with different ranks
      expect(calculateRRF(undefined, 1)).toBeCloseTo(1 / (60 + 1)); // ~0.0164
      expect(calculateRRF(undefined, 2)).toBeCloseTo(1 / (60 + 2)); // ~0.0161
      expect(calculateRRF(undefined, 3)).toBeCloseTo(1 / (60 + 3)); // ~0.0159

      // Better FTS rank should produce higher RRF score
      expect(calculateRRF(undefined, 1)).toBeGreaterThan(calculateRRF(undefined, 2));
      expect(calculateRRF(undefined, 2)).toBeGreaterThan(calculateRRF(undefined, 3));
    });

    it("should calculate correct RRF scores for hybrid results (both vector and FTS)", async () => {
      const calculateRRF = getPrivateMethod(documentStore, "calculateRRF");

      // Test hybrid results
      const hybridScore = calculateRRF(1, 1); // Both rank 1
      const vectorOnlyScore = calculateRRF(1, undefined); // Vector rank 1 only
      const ftsOnlyScore = calculateRRF(undefined, 1); // FTS rank 1 only

      // Hybrid should be sum of both components
      expect(hybridScore).toBeCloseTo(1 / 61 + 1 / 61); // ~0.0328
      expect(hybridScore).toBeCloseTo(vectorOnlyScore + ftsOnlyScore);

      // Hybrid results should beat single-mode results
      expect(hybridScore).toBeGreaterThan(vectorOnlyScore);
      expect(hybridScore).toBeGreaterThan(ftsOnlyScore);
    });
  });

  describe("Rank Assignment", () => {
    const getPrivateMethod = (obj: any, methodName: string) => obj[methodName].bind(obj);

    it("should assign ranks correctly based on normalized scores (higher score = better rank)", async () => {
      const assignRanks = getPrivateMethod(documentStore, "assignRanks");

      // Test data with known normalized scores (higher = better)
      const mockResults = [
        { id: 1, vec_score: 0.9, fts_score: 0.8 }, // Best scores
        { id: 2, vec_score: 0.5, fts_score: 0.6 }, // Medium scores
        { id: 3, vec_score: 0.1, fts_score: 0.2 }, // Worst scores
      ];

      const rankedResults = assignRanks(mockResults);

      // Verify vector ranks (highest score gets rank 1)
      const doc1 = rankedResults.find((r: any) => r.id === 1);
      const doc2 = rankedResults.find((r: any) => r.id === 2);
      const doc3 = rankedResults.find((r: any) => r.id === 3);

      expect(doc1?.vec_rank).toBe(1); // 0.9 score -> rank 1
      expect(doc2?.vec_rank).toBe(2); // 0.5 score -> rank 2
      expect(doc3?.vec_rank).toBe(3); // 0.1 score -> rank 3

      // Verify FTS ranks (highest score gets rank 1)
      expect(doc1?.fts_rank).toBe(1); // 0.8 score -> rank 1
      expect(doc2?.fts_rank).toBe(2); // 0.6 score -> rank 2
      expect(doc3?.fts_rank).toBe(3); // 0.2 score -> rank 3

      // Verify RRF scores are calculated and ordered correctly
      expect(doc1?.rrf_score).toBeGreaterThan(doc2?.rrf_score!);
      expect(doc2?.rrf_score).toBeGreaterThan(doc3?.rrf_score!);
    });

    it("should handle documents that appear in only one search type", async () => {
      const assignRanks = getPrivateMethod(documentStore, "assignRanks");

      // Test data with mixed presence in vector vs FTS
      const mockResults = [
        { id: 1, vec_score: 0.9, fts_score: undefined }, // Vector only
        { id: 2, vec_score: undefined, fts_score: 0.8 }, // FTS only
        { id: 3, vec_score: 0.5, fts_score: 0.6 }, // Both
      ];

      const rankedResults = assignRanks(mockResults);

      const doc1 = rankedResults.find((r: any) => r.id === 1);
      const doc2 = rankedResults.find((r: any) => r.id === 2);
      const doc3 = rankedResults.find((r: any) => r.id === 3);

      // Vector-only document should have vec_rank but no fts_rank
      expect(doc1?.vec_rank).toBe(1); // Best vector score
      expect(doc1?.fts_rank).toBeUndefined();

      // FTS-only document should have fts_rank but no vec_rank
      expect(doc2?.vec_rank).toBeUndefined();
      expect(doc2?.fts_rank).toBe(1); // Best (only) FTS score

      // Hybrid document should have both ranks
      expect(doc3?.vec_rank).toBe(2); // Second best vector score
      expect(doc3?.fts_rank).toBe(2); // Second best FTS score

      // All should have valid RRF scores
      expect(doc1?.rrf_score).toBeGreaterThan(0);
      expect(doc2?.rrf_score).toBeGreaterThan(0);
      expect(doc3?.rrf_score).toBeGreaterThan(0);
    });
  });

  describe("Hybrid Search Integration", () => {
    it("should prioritize documents that appear in both vector and FTS searches", async () => {
      const getPrivateMethod = (obj: any, methodName: string) =>
        obj[methodName].bind(obj);
      const assignRanks = getPrivateMethod(documentStore, "assignRanks");

      // Test scenario: one hybrid document vs two single-mode documents
      const mockResults = [
        { id: 1, vec_score: 0.7, fts_score: 0.7 }, // Appears in both, medium scores
        { id: 2, vec_score: 0.9, fts_score: undefined }, // Best vector score, no FTS
        { id: 3, vec_score: undefined, fts_score: 0.9 }, // Best FTS score, no vector
      ];

      const rankedResults = assignRanks(mockResults);

      // Sort by RRF score like the real algorithm does
      const sortedResults = rankedResults.sort(
        (a: any, b: any) => b.rrf_score - a.rrf_score,
      );

      const hybrid = rankedResults.find((r: any) => r.id === 1);
      const vectorOnly = rankedResults.find((r: any) => r.id === 2);
      const ftsOnly = rankedResults.find((r: any) => r.id === 3);

      // Hybrid document should have highest RRF score despite lower individual ranks
      expect(hybrid?.rrf_score).toBeGreaterThan(vectorOnly?.rrf_score!);
      expect(hybrid?.rrf_score).toBeGreaterThan(ftsOnly?.rrf_score!);

      // Verify the hybrid document appears first in final ranking
      expect(sortedResults[0].id).toBe(1);
    });

    it("should produce final ranking ordered by RRF score (highest first)", async () => {
      const getPrivateMethod = (obj: any, methodName: string) =>
        obj[methodName].bind(obj);
      const assignRanks = getPrivateMethod(documentStore, "assignRanks");

      const mockResults = [
        { id: 1, vec_score: 0.1, fts_score: 0.1 },
        { id: 2, vec_score: 0.9, fts_score: 0.9 },
        { id: 3, vec_score: 0.5, fts_score: 0.5 },
      ];

      const rankedResults = assignRanks(mockResults);

      const sortedResults = rankedResults.sort(
        (a: any, b: any) => b.rrf_score - a.rrf_score,
      );

      // Should be ordered: best, medium, worst
      expect(sortedResults[0].id).toBe(2);
      expect(sortedResults[1].id).toBe(3);
      expect(sortedResults[2].id).toBe(1);

      // Verify RRF scores are in descending order
      expect(sortedResults[0].rrf_score).toBeGreaterThan(sortedResults[1].rrf_score);
      expect(sortedResults[1].rrf_score).toBeGreaterThan(sortedResults[2].rrf_score);
    });

    it("should handle mixed scenarios where some docs are vector-only, some FTS-only, some both", async () => {
      const getPrivateMethod = (obj: any, methodName: string) =>
        obj[methodName].bind(obj);
      const assignRanks = getPrivateMethod(documentStore, "assignRanks");

      const mockResults = [
        { id: 1, vec_score: 0.9, fts_score: 0.9 }, // Best in both
        { id: 2, vec_score: 0.8, fts_score: undefined }, // Good vector only
        { id: 3, vec_score: undefined, fts_score: 0.8 }, // Good FTS only
        { id: 4, vec_score: 0.3, fts_score: 0.3 }, // Poor in both
      ];

      const rankedResults = assignRanks(mockResults);
      const sortedResults = rankedResults.sort(
        (a: any, b: any) => b.rrf_score - a.rrf_score,
      );

      // Perfect hybrid should be first
      expect(sortedResults[0].id).toBe(1);

      // Poor hybrid should beat single-mode results despite lower scores
      const poorHybrid = rankedResults.find((r: any) => r.id === 4);
      const goodVector = rankedResults.find((r: any) => r.id === 2);
      const goodFts = rankedResults.find((r: any) => r.id === 3);

      // Poor hybrid (rank 2+2) should beat good single-mode (rank 1 only)
      expect(poorHybrid?.rrf_score).toBeGreaterThan(goodVector?.rrf_score!);
      expect(poorHybrid?.rrf_score).toBeGreaterThan(goodFts?.rrf_score!);
    });
  });

  describe("RRF Edge Cases", () => {
    const getPrivateMethod = (obj: any, methodName: string) => obj[methodName].bind(obj);

    it("should handle empty results gracefully", async () => {
      const assignRanks = getPrivateMethod(documentStore, "assignRanks");

      const emptyResults = assignRanks([]);
      expect(emptyResults).toEqual([]);
    });

    it("should handle identical scores (tie-breaking)", async () => {
      const assignRanks = getPrivateMethod(documentStore, "assignRanks");

      // Test documents with identical scores
      const mockResults = [
        { id: "1", vec_score: 0.5, fts_score: 0.5 },
        { id: "2", vec_score: 0.5, fts_score: 0.5 },
        { id: "3", vec_score: 0.5, fts_score: 0.5 },
      ];

      const rankedResults = assignRanks(mockResults);

      // All should get different ranks (stable sort order)
      const ranks = rankedResults.map((r: any) => r.vec_rank);
      const uniqueRanks = new Set(ranks);
      expect(uniqueRanks.size).toBe(3); // Should have ranks 1, 2, 3

      // RRF scores should be different since ranks are different
      const rrfScores = rankedResults.map((r: any) => r.rrf_score);

      // Calculate expected RRF scores manually
      const expectedRrf1 = 1 / 61 + 1 / 61; // rank 1,1 → ~0.0328
      const expectedRrf2 = 1 / 62 + 1 / 62; // rank 2,2 → ~0.0323
      const expectedRrf3 = 1 / 63 + 1 / 63; // rank 3,3 → ~0.0317

      expect(rrfScores[0]).toBeCloseTo(expectedRrf1, 6);
      expect(rrfScores[1]).toBeCloseTo(expectedRrf2, 6);
      expect(rrfScores[2]).toBeCloseTo(expectedRrf3, 6);

      // Verify they are in descending order
      expect(rrfScores[0]).toBeGreaterThan(rrfScores[1]);
      expect(rrfScores[1]).toBeGreaterThan(rrfScores[2]);
    });
  });
});
