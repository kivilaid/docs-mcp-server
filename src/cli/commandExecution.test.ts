/**
 * CLI command execution tests (happy-path, integration-light).
 * Verifies arg parsing -> tool/service usage wiring without duplicating tool/service internals.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Tracking structures
const createdDocServices: any[] = [];
const toolConstructors: Record<string, number> = {};
const toolExecuteCalls: Record<string, any[]> = {};
const serviceRemoveCalls: any[] = [];

// Mock store to capture serverUrl usage & remove calls
vi.mock("../store", async () => {
  const actual = await vi.importActual<any>("../store");
  return {
    ...actual,
    createDocumentManagement: vi.fn(async (opts: any) => {
      createdDocServices.push(opts);
      return {
        shutdown: vi.fn(),
        removeAllDocuments: vi.fn(async (...args: any[]) => {
          serviceRemoveCalls.push(args);
        }),
      };
    }),
  };
});

// Mock tools to count constructors + capture execute invocations
vi.mock("../tools", async () => {
  const actual = await vi.importActual<any>("../tools");
  const wrap = (name: string) =>
    vi.fn().mockImplementation(() => {
      toolConstructors[name] = (toolConstructors[name] || 0) + 1;
      return {
        execute: vi.fn(async (args: any) => {
          toolExecuteCalls[name] = toolExecuteCalls[name] || [];
          toolExecuteCalls[name].push(args);
          if (name === "ListLibrariesTool") return { libraries: [] };
          if (name === "SearchTool") return { results: [] };
          if (name === "FindVersionTool") return { version: "1.0.0" };
          if (name === "ScrapeTool") return { jobId: "job-123" };
          if (name === "FetchUrlTool") return "# markdown";
          return {};
        }),
      };
    });
  return {
    ...actual,
    ListLibrariesTool: wrap("ListLibrariesTool"),
    SearchTool: wrap("SearchTool"),
    FindVersionTool: wrap("FindVersionTool"),
    ScrapeTool: wrap("ScrapeTool"),
    FetchUrlTool: wrap("FetchUrlTool"),
  };
});

const SERVER_URL = "http://localhost:6280/api";
interface Case {
  name: string;
  args: string[];
  expectTool?: string;
  expectServerUrl?: boolean;
  expectServiceRemove?: boolean;
}

const cases: Case[] = [
  {
    name: "list",
    args: ["list", "--server-url", SERVER_URL],
    expectTool: "ListLibrariesTool",
    expectServerUrl: true,
  },
  {
    name: "search",
    args: ["search", "react", "hooks", "--limit", "2", "--server-url", SERVER_URL],
    expectTool: "SearchTool",
    expectServerUrl: true,
  },
  {
    name: "find-version",
    args: ["find-version", "react", "--version", "18.x", "--server-url", SERVER_URL],
    expectTool: "FindVersionTool",
    expectServerUrl: true,
  },
  {
    name: "remove",
    args: ["remove", "react", "--version", "18.0.0", "--server-url", SERVER_URL],
    expectServiceRemove: true,
    expectServerUrl: true,
  },
  {
    name: "scrape (remote)",
    args: [
      "scrape",
      "react",
      "https://react.dev/reference/react",
      "--max-pages",
      "3",
      "--server-url",
      SERVER_URL,
    ],
    expectTool: "ScrapeTool",
    expectServerUrl: true,
  },
  {
    name: "fetch-url (local)",
    args: ["fetch-url", "https://example.com"],
    expectTool: "FetchUrlTool",
    expectServerUrl: false,
  },
];

beforeEach(() => {
  createdDocServices.length = 0;
  serviceRemoveCalls.length = 0;
  for (const k of Object.keys(toolConstructors)) delete toolConstructors[k];
  for (const k of Object.keys(toolExecuteCalls)) delete toolExecuteCalls[k];
});

describe("CLI Command Execution (happy paths)", () => {
  it.each(cases)("%s", async (_case) => {
    const { createCliProgram } = await import("./index");
    const program = createCliProgram();
    await expect(
      program.parseAsync(["node", "test", ..._case.args]),
    ).resolves.not.toThrow();

    if (_case.expectServerUrl) {
      expect(createdDocServices).toContainEqual({ serverUrl: SERVER_URL });
    } else if (_case.name.startsWith("fetch-url")) {
      expect(createdDocServices.length).toBe(0);
    }

    if (_case.expectTool) {
      expect(toolConstructors[_case.expectTool]).toBe(1);
      expect(toolExecuteCalls[_case.expectTool]?.length).toBe(1);
    }

    if (_case.expectServiceRemove) {
      expect(serviceRemoveCalls.length).toBe(1);
      expect(serviceRemoveCalls[0][0]).toBe("react");
      expect(serviceRemoveCalls[0][1]).toBe("18.0.0");
    }
  });
});
