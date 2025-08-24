import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  getKnownModelDimensions,
  parseEmbeddingConfig,
  setKnownModelDimensions,
} from "./EmbeddingConfig";

// Mock process.env for each test
const originalEnv = process.env;

beforeEach(() => {
  vi.stubGlobal("process", {
    env: {
      ...originalEnv,
      DOCS_MCP_EMBEDDING_MODEL: undefined,
    },
  });
});

afterEach(() => {
  vi.stubGlobal("process", { env: originalEnv });
});

describe("parseEmbeddingConfig", () => {
  test("should parse OpenAI model without provider prefix", () => {
    const config = parseEmbeddingConfig("text-embedding-3-small");

    expect(config).toEqual({
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
      modelSpec: "text-embedding-3-small",
    });
  });

  test("should parse OpenAI model with explicit provider", () => {
    const config = parseEmbeddingConfig("openai:text-embedding-3-large");

    expect(config).toEqual({
      provider: "openai",
      model: "text-embedding-3-large",
      dimensions: 3072,
      modelSpec: "openai:text-embedding-3-large",
    });
  });

  test("should parse Google Vertex AI model", () => {
    const config = parseEmbeddingConfig("vertex:text-embedding-004");

    expect(config).toEqual({
      provider: "vertex",
      model: "text-embedding-004",
      dimensions: 768,
      modelSpec: "vertex:text-embedding-004",
    });
  });

  test("should parse Google Gemini model", () => {
    const config = parseEmbeddingConfig("gemini:embedding-001");

    expect(config).toEqual({
      provider: "gemini",
      model: "embedding-001",
      dimensions: 768,
      modelSpec: "gemini:embedding-001",
    });
  });

  test("should parse AWS Bedrock model with colon in name", () => {
    const config = parseEmbeddingConfig("aws:amazon.titan-embed-text-v2:0");

    expect(config).toEqual({
      provider: "aws",
      model: "amazon.titan-embed-text-v2:0",
      dimensions: 1024,
      modelSpec: "aws:amazon.titan-embed-text-v2:0",
    });
  });

  test("should parse SageMaker model", () => {
    const config = parseEmbeddingConfig("sagemaker:intfloat/multilingual-e5-large");

    expect(config).toEqual({
      provider: "sagemaker",
      model: "intfloat/multilingual-e5-large",
      dimensions: 1024,
      modelSpec: "sagemaker:intfloat/multilingual-e5-large",
    });
  });
  test("should parse Microsoft Azure model", () => {
    const config = parseEmbeddingConfig("microsoft:text-embedding-ada-002");

    expect(config).toEqual({
      provider: "microsoft",
      model: "text-embedding-ada-002",
      dimensions: 1536,
      modelSpec: "microsoft:text-embedding-ada-002",
    });
  });

  test("should return null dimensions for unknown model", () => {
    const config = parseEmbeddingConfig("openai:unknown-model");

    expect(config).toEqual({
      provider: "openai",
      model: "unknown-model",
      dimensions: null,
      modelSpec: "openai:unknown-model",
    });
  });

  test("should use environment variable when no modelSpec provided", () => {
    vi.stubGlobal("process", {
      env: {
        ...originalEnv,
        DOCS_MCP_EMBEDDING_MODEL: "vertex:text-embedding-004",
      },
    });

    const config = parseEmbeddingConfig();

    expect(config).toEqual({
      provider: "vertex",
      model: "text-embedding-004",
      dimensions: 768,
      modelSpec: "vertex:text-embedding-004",
    });
  });

  test("should default to text-embedding-3-small when no env var set", () => {
    const config = parseEmbeddingConfig();

    expect(config).toEqual({
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
      modelSpec: "text-embedding-3-small",
    });
  });
});

describe("getKnownModelDimensions", () => {
  test("should return known dimensions for various model types", () => {
    // OpenAI models
    expect(getKnownModelDimensions("text-embedding-3-small")).toBe(1536);
    expect(getKnownModelDimensions("text-embedding-3-large")).toBe(3072);

    // Google models
    expect(getKnownModelDimensions("text-embedding-004")).toBe(768);
    expect(getKnownModelDimensions("embedding-001")).toBe(768);

    // AWS models
    expect(getKnownModelDimensions("amazon.titan-embed-text-v1")).toBe(1536);
    expect(getKnownModelDimensions("amazon.titan-embed-text-v2:0")).toBe(1024);
    expect(getKnownModelDimensions("cohere.embed-english-v3")).toBe(1024);

    // SageMaker models
    expect(getKnownModelDimensions("intfloat/multilingual-e5-large")).toBe(1024);
    expect(getKnownModelDimensions("sentence-transformers/all-MiniLM-L6-v2")).toBe(384);
  });

  test("should return null for unknown model", () => {
    expect(getKnownModelDimensions("unknown-model")).toBeNull();
  });
});

describe("setKnownModelDimensions", () => {
  test("should cache new model dimensions", () => {
    const modelName = "new-test-model";
    const dimensions = 2048;

    // Initially unknown
    expect(getKnownModelDimensions(modelName)).toBeNull();

    // Cache the dimensions
    setKnownModelDimensions(modelName, dimensions);

    // Now should return cached value
    expect(getKnownModelDimensions(modelName)).toBe(dimensions);

    // Should also work in parseEmbeddingConfig
    const config = parseEmbeddingConfig(`openai:${modelName}`);
    expect(config.dimensions).toBe(dimensions);
  });

  test("should update existing model dimensions", () => {
    const modelName = "text-embedding-3-small";
    const newDimensions = 999;

    // Initial known value
    expect(getKnownModelDimensions(modelName)).toBe(1536);

    // Update the dimensions
    setKnownModelDimensions(modelName, newDimensions);

    // Should return updated value
    expect(getKnownModelDimensions(modelName)).toBe(newDimensions);
  });
});

describe("case-insensitive model lookups", () => {
  test("should find models with different capitalization", () => {
    // Use a model that wasn't modified by previous tests
    expect(getKnownModelDimensions("text-embedding-3-large")).toBe(3072);
    expect(getKnownModelDimensions("TEXT-EMBEDDING-3-LARGE")).toBe(3072);
    expect(getKnownModelDimensions("Text-Embedding-3-Large")).toBe(3072);
    expect(getKnownModelDimensions("TEXT-embedding-3-LARGE")).toBe(3072);
  });

  test("should find Hugging Face models with different capitalization", () => {
    // Test some MTEB models with different cases
    expect(getKnownModelDimensions("BAAI/bge-large-en-v1.5")).toBe(1024);
    expect(getKnownModelDimensions("baai/bge-large-en-v1.5")).toBe(1024);
    expect(getKnownModelDimensions("Baai/Bge-Large-En-V1.5")).toBe(1024);
  });

  test("should work in parseEmbeddingConfig with different capitalization", () => {
    const config1 = parseEmbeddingConfig("openai:TEXT-EMBEDDING-3-LARGE");
    const config2 = parseEmbeddingConfig("openai:text-embedding-3-large");

    expect(config1.dimensions).toBe(3072);
    expect(config2.dimensions).toBe(3072);
    expect(config1.model).toBe("TEXT-EMBEDDING-3-LARGE"); // Original case preserved
    expect(config2.model).toBe("text-embedding-3-large"); // Original case preserved
  });

  test("should cache models with case-insensitive lookup", () => {
    const modelName = "New-Test-Model";
    const dimensions = 512;

    // Set dimensions for one case
    setKnownModelDimensions(modelName, dimensions);

    // Should find it with different capitalization
    expect(getKnownModelDimensions("new-test-model")).toBe(dimensions);
    expect(getKnownModelDimensions("NEW-TEST-MODEL")).toBe(dimensions);
    expect(getKnownModelDimensions("New-Test-Model")).toBe(dimensions);
  });
});
