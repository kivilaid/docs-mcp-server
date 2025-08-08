/**
 * CLI argument validation tests.
 * Tests that commands accept the correct arguments according to the CLI Commands and Arguments Matrix.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCliProgram } from "./index";
import { resolveProtocol, validatePort, validateResumeFlag } from "./utils";

describe("CLI Command Arguments Matrix", () => {
  const program = createCliProgram();

  // Extract command options for easier testing
  const getCommandOptions = (commandName?: string) => {
    if (!commandName) {
      // Main program options (default action)
      return program.options.map((opt) => opt.long);
    }

    const command = program.commands.find((cmd) => cmd.name() === commandName);
    return command?.options.map((opt) => opt.long) || [];
  };

  // Test the CLI Commands and Arguments Matrix
  const commandMatrix = {
    default: {
      hasVerboseSilent: true,
      hasPort: true,
      hasServerUrl: false, // Default action doesn't have server-url
      hasProtocol: true,
      hasResume: true,
    },
    mcp: {
      hasVerboseSilent: true,
      hasPort: true,
      hasServerUrl: true,
      hasProtocol: true,
      hasResume: false,
    },
    web: {
      hasVerboseSilent: true,
      hasPort: true,
      hasServerUrl: true,
      hasProtocol: false,
      hasResume: false,
    },
    worker: {
      hasVerboseSilent: true,
      hasPort: true,
      hasServerUrl: false,
      hasProtocol: false,
      hasResume: true,
    },
    scrape: {
      hasVerboseSilent: true,
      hasPort: false,
      hasServerUrl: true,
      hasProtocol: false,
      hasResume: false,
    },
    search: {
      hasVerboseSilent: true,
      hasPort: false,
      hasServerUrl: false,
      hasProtocol: false,
      hasResume: false,
    },
    list: {
      hasVerboseSilent: true,
      hasPort: false,
      hasServerUrl: false,
      hasProtocol: false,
      hasResume: false,
    },
    remove: {
      hasVerboseSilent: true,
      hasPort: false,
      hasServerUrl: false,
      hasProtocol: false,
      hasResume: false,
    },
    "find-version": {
      hasVerboseSilent: true,
      hasPort: false,
      hasServerUrl: false,
      hasProtocol: false,
      hasResume: false,
    },
    "fetch-url": {
      hasVerboseSilent: true,
      hasPort: false,
      hasServerUrl: false,
      hasProtocol: false,
      hasResume: false,
    },
  };

  // Test each command according to the matrix
  Object.entries(commandMatrix).forEach(([commandName, expectedOptions]) => {
    it(`should have correct options for ${commandName} command`, () => {
      const options = getCommandOptions(
        commandName === "default" ? undefined : commandName,
      );

      // Global options (--verbose/--silent) are inherited for all commands
      if (expectedOptions.hasVerboseSilent && commandName !== "default") {
        // For subcommands, global options are available through parent
        const globalOptions = program.options.map((opt) => opt.long);
        expect(globalOptions).toContain("--verbose");
        expect(globalOptions).toContain("--silent");
      } else if (commandName === "default") {
        expect(options).toContain("--verbose");
        expect(options).toContain("--silent");
      }

      // Test specific options
      if (expectedOptions.hasPort) {
        expect(options).toContain("--port");
      } else {
        expect(options).not.toContain("--port");
      }

      if (expectedOptions.hasServerUrl) {
        expect(options).toContain("--server-url");
      } else {
        expect(options).not.toContain("--server-url");
      }

      if (expectedOptions.hasProtocol) {
        expect(options).toContain("--protocol");
      } else {
        expect(options).not.toContain("--protocol");
      }

      if (expectedOptions.hasResume) {
        expect(options).toContain("--resume");
      } else {
        expect(options).not.toContain("--resume");
      }
    });
  });

  it("should register all expected commands", () => {
    const commandNames = program.commands.map((cmd) => cmd.name());
    expect(commandNames).toEqual([
      "mcp",
      "web",
      "worker",
      "scrape",
      "search",
      "list",
      "find-version",
      "remove",
      "fetch-url",
    ]);
  });
});

describe("CLI Validation Logic", () => {
  describe("resolveProtocol", () => {
    it("should return explicit protocol values", () => {
      expect(resolveProtocol("stdio")).toBe("stdio");
      expect(resolveProtocol("http")).toBe("http");
    });

    it("should auto-detect stdio when no TTY", () => {
      // Mock no TTY environment (like CI/CD or VS Code)
      vi.stubGlobal("process", {
        ...process,
        stdin: { isTTY: false },
        stdout: { isTTY: false },
      });

      expect(resolveProtocol("auto")).toBe("stdio");
    });

    it("should auto-detect http when TTY is available", () => {
      // Mock TTY environment (like terminal)
      vi.stubGlobal("process", {
        ...process,
        stdin: { isTTY: true },
        stdout: { isTTY: true },
      });

      expect(resolveProtocol("auto")).toBe("http");
    });

    it("should throw on invalid protocol", () => {
      expect(() => resolveProtocol("invalid")).toThrow(
        "Invalid protocol: invalid. Must be 'auto', 'stdio', or 'http'",
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });
  });

  describe("validatePort", () => {
    it("should accept valid port numbers", () => {
      expect(validatePort("3000")).toBe(3000);
      expect(validatePort("8080")).toBe(8080);
      expect(validatePort("1")).toBe(1);
      expect(validatePort("65535")).toBe(65535);
    });

    it("should throw on clearly invalid port numbers", () => {
      expect(() => validatePort("0")).toThrow();
      expect(() => validatePort("65536")).toThrow();
      expect(() => validatePort("-1")).toThrow();
      expect(() => validatePort("abc")).toThrow();
      expect(() => validatePort("")).toThrow();
    });
  });

  describe("validateResumeFlag", () => {
    it("should allow resume without server URL", () => {
      expect(() => validateResumeFlag(true)).not.toThrow();
      expect(() => validateResumeFlag(true, undefined)).not.toThrow();
    });

    it("should allow no resume with server URL", () => {
      expect(() => validateResumeFlag(false, "http://example.com")).not.toThrow();
    });

    it("should throw when resume is used with server URL", () => {
      expect(() => validateResumeFlag(true, "http://example.com")).toThrow(
        "--resume flag is incompatible with --server-url. External workers handle their own job recovery.",
      );
    });
  });
});
