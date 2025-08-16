import { describe, expect, it } from "vitest";
import { computeBaseDirectory, isInScope } from "./scope";

describe("computeBaseDirectory", () => {
  it("returns directory unchanged when pathname ends with slash", () => {
    expect(computeBaseDirectory("/api/")).toBe("/api/");
  });

  it("treats file-looking path as its parent directory", () => {
    expect(computeBaseDirectory("/api/index.html")).toBe("/api/");
    expect(computeBaseDirectory("/deep/path/file.md")).toBe("/deep/path/");
  });

  it("treats non-file last segment (no dot) as directory and appends slash", () => {
    expect(computeBaseDirectory("/api")).toBe("/api/");
    expect(computeBaseDirectory("/api/v1")).toBe("/api/v1/");
  });

  it("root path stays root", () => {
    expect(computeBaseDirectory("/")).toBe("/");
  });
});

describe("isInScope - subpages", () => {
  const baseFile = new URL("https://example.com/api/index.html");
  const baseDir = new URL("https://example.com/api/");
  const nested = new URL("https://example.com/api/child/page.html");
  const upward = new URL("https://example.com/shared/page.html");

  it("file base acts like its parent directory for descendants", () => {
    expect(isInScope(baseFile, nested, "subpages")).toBe(true);
  });

  it("directory base includes descendant", () => {
    expect(isInScope(baseDir, nested, "subpages")).toBe(true);
  });

  it("file base excludes upward sibling", () => {
    expect(isInScope(baseFile, upward, "subpages")).toBe(false);
  });

  it("non-file segment without slash acts as directory", () => {
    const base = new URL("https://example.com/api");
    expect(isInScope(base, nested, "subpages")).toBe(true);
  });
});

describe("isInScope - hostname and domain", () => {
  const base = new URL("https://docs.example.com/guide/");
  const sameHost = new URL("https://docs.example.com/guide/intro");
  const diffSub = new URL("https://api.example.com/endpoint");
  const diffDomain = new URL("https://other.org/");

  it("hostname scope restricts to exact hostname", () => {
    expect(isInScope(base, sameHost, "hostname")).toBe(true);
    expect(isInScope(base, diffSub, "hostname")).toBe(false);
  });

  it("domain scope allows different subdomains under same registrable domain", () => {
    expect(isInScope(base, diffSub, "domain")).toBe(true);
    expect(isInScope(base, diffDomain, "domain")).toBe(false);
  });
});
