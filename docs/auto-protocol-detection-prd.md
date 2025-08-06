# Auto Protocol Detection and Resume Flag - Product Requirements Document

## Overview

This PRD outlines the implementation of automatic protocol detection for the docs-mcp-server CLI, along with explicit job recovery control via a new `--resume` flag. The solution provides seamless VS Code integration while maintaining full backwards compatibility and removing external dependency requirements.

## Problem Statement

Currently, the docs-mcp-server has several usability and coordination issues:

1. **Manual Protocol Selection**: Users must explicitly specify `--protocol stdio` for VS Code integration vs `--protocol http` for local development
2. **External Dependencies**: Many commands require `--server-url` parameter, creating setup friction
3. **Implicit Job Recovery**: Job recovery behavior is tied to external worker usage, making it unpredictable
4. **VS Code Integration Complexity**: Users need to understand protocol differences for proper VS Code configuration

## Solution Overview

Implement **automatic protocol detection** with **explicit job recovery control**:

1. **"auto" Protocol (New Default)**: Automatically detect whether to use stdio or http based on TTY status
2. **--resume Flag**: Explicit control over job recovery for in-process workers only
3. **Remove External Dependencies**: All modes work standalone without requiring `--server-url`
4. **Backwards Compatibility**: All existing commands continue to work exactly as before

## Core Concepts

### Protocol Detection Logic

```typescript
function resolveProtocol(protocol: string): "stdio" | "http" {
  if (protocol === "auto") {
    // If both stdin and stdout are NOT TTY (piped/redirected), use stdio
    if (!process.stdin.isTTY && !process.stdout.isTTY) {
      return "stdio";
    }
    return "http";
  }
  return protocol as "stdio" | "http";
}
```

**Detection Rules:**

- **No TTY** (both `!process.stdin.isTTY && !process.stdout.isTTY`) → `stdio` mode
- **Has TTY** (interactive terminal) → `http` mode
- **Manual override** always respected (`--protocol stdio` or `--protocol http`)

### Job Recovery Control

**Key Principle**: `--resume` flag is ONLY valid for in-process workers (no `--server-url`)

```typescript
// Validation logic
if (resume && serverUrl) {
  throw new Error(
    "--resume flag is incompatible with --server-url (external worker handles its own job recovery)"
  );
}
```

**Recovery Behavior:**

- **`--resume false`** (default): Clean start, no job recovery
- **`--resume true`**: Recover interrupted jobs from database
- **External workers**: Always handle their own job recovery (unchanged behavior)

### Protocol vs Services Matrix

| Resolved Protocol | Services Enabled                  | Implementation                | Use Case                         |
| ----------------- | --------------------------------- | ----------------------------- | -------------------------------- |
| `stdio`           | MCP Server only (stdio transport) | Direct `StdioServerTransport` | VS Code integration, API access  |
| `http`            | MCP + Web + Pipeline API + Worker | AppServer with HTTP/SSE       | Local development, full features |

### Job Recovery Decision Matrix

| `--server-url`   | `--resume`        | Worker Location | Job Recovery     | Validation |
| ---------------- | ----------------- | --------------- | ---------------- | ---------- |
| ❌ Not specified | `false` (default) | In-process      | None             | ✅ Valid   |
| ❌ Not specified | `true`            | In-process      | Yes              | ✅ Valid   |
| ✅ Specified     | ❌ Not specified  | External        | External decides | ✅ Valid   |
| ✅ Specified     | `true`            | External        | N/A              | ❌ Error   |

## Implementation Requirements

### Phase 1: Core Infrastructure

#### 1.1 Update Configuration

**File**: `src/utils/config.ts`

```typescript
// Change default protocol from "stdio" to "auto"
export const DEFAULT_PROTOCOL = "auto";
```

#### 1.2 Add Protocol Resolution Function

**File**: `src/index.ts`

```typescript
/**
 * Resolves the protocol based on auto-detection or explicit specification.
 * Auto-detection uses TTY status to determine appropriate protocol.
 */
function resolveProtocol(protocol: string): "stdio" | "http" {
  if (protocol === "auto") {
    // VS Code and CI/CD typically run without TTY
    if (!process.stdin.isTTY && !process.stdout.isTTY) {
      return "stdio";
    }
    return "http";
  }

  // Explicit protocol specification
  if (protocol === "stdio" || protocol === "http") {
    return protocol;
  }

  throw new Error(
    `Invalid protocol: ${protocol}. Must be 'auto', 'stdio', or 'http'`
  );
}
```

#### 1.3 Add Resume Flag Validation

**File**: `src/index.ts`

```typescript
/**
 * Validates that --resume flag is only used with in-process workers.
 */
function validateResumeFlag(resume: boolean, serverUrl?: string): void {
  if (resume && serverUrl) {
    throw new Error(
      "--resume flag is incompatible with --server-url. " +
        "External workers handle their own job recovery."
    );
  }
}
```

### Phase 2: CLI Updates

#### 2.1 Update Global Options

```typescript
program
  .option(
    "--protocol <type>",
    "Protocol for MCP server: 'auto' (default), 'stdio', or 'http'",
    DEFAULT_PROTOCOL
  )
  .option(
    "--resume",
    "Resume interrupted jobs on startup (only valid without --server-url)",
    false
  )
  .option(
    "--server-url <url>",
    "URL of external pipeline worker API (e.g., http://localhost:6280/api)"
  );
```

#### 2.2 Update Help Text

- Protocol description: `"Protocol for MCP server: 'auto' (default), 'stdio', or 'http'"`
- Add resume flag documentation
- Remove "required" language from server-url descriptions

### Phase 3: Command Updates

#### 3.1 Update Unified Server (Default Action)

```typescript
program.action(async (options) => {
  if (!commandExecuted) {
    commandExecuted = true;

    // Resolve protocol and validate flags
    const resolvedProtocol = resolveProtocol(options.protocol);
    validateResumeFlag(options.resume, options.serverUrl);

    // Suppress logging in stdio mode (before any logger calls)
    if (resolvedProtocol === "stdio") {
      setLogLevel(LogLevel.ERROR);
    }

    const docService = await ensureDocServiceInitialized();
    const pipeline = await ensurePipelineManagerInitialized({
      recoverJobs: options.resume || false, // Use --resume flag for job recovery
      serverUrl: options.serverUrl,
      concurrency: 3,
    });

    if (resolvedProtocol === "stdio") {
      // Direct stdio mode - bypass AppServer entirely
      logger.debug(`🔍 Auto-detected stdio protocol (no TTY)`);
      logger.info("🚀 Starting MCP server (stdio mode)");

      const mcpTools = await initializeTools(docService, pipeline);
      activeMcpStdioServer = await startStdioServer(mcpTools);

      await new Promise(() => {}); // Keep running forever
    } else {
      // HTTP mode - use AppServer
      logger.debug(`🔍 Auto-detected http protocol (TTY available)`);
      logger.info("🚀 Starting unified server (web + MCP + pipeline + worker)");

      const config: AppServerConfig = {
        enableWebInterface: true,
        enableMcpServer: true,
        enablePipelineApi: true,
        enableWorker: !options.serverUrl,
        port: Number.parseInt(options.port, 10),
        externalWorkerUrl: options.serverUrl,
      };

      activeAppServer = startAppServer(docService, pipeline, config);
      await activeAppServer;
      await new Promise(() => {}); // Keep running forever
    }
  }
});
```

#### 3.2 Remove --server-url Requirements

**Files to update**:

- `mcp` command: Remove server-url requirement, add resume flag support
- `web` command: Remove server-url requirement, add resume flag support
- Update error messages to remove external dependency examples

#### 3.3 Update Individual Commands

```typescript
// MCP Command - Remove server-url requirement
program
  .command("mcp")
  .description("Start MCP server only")
  .option(
    "--port <number>",
    "Port for the MCP server",
    DEFAULT_HTTP_PORT.toString()
  )
  .option("--resume", "Resume interrupted jobs on startup", false)
  .option(
    "--server-url <url>",
    "URL of external pipeline worker API (e.g., http://localhost:6280/api)"
  )
  .action(async (cmdOptions, command) => {
    commandExecuted = true;
    const globalOptions = command.parent?.opts() || {};
    const resume = cmdOptions.resume || globalOptions.resume;
    const serverUrl = cmdOptions.serverUrl || globalOptions.serverUrl;

    validateResumeFlag(resume, serverUrl);

    // Resolve protocol using same logic as default action
    const resolvedProtocol = resolveProtocol(
      globalOptions.protocol || DEFAULT_PROTOCOL
    );

    // Suppress logging in stdio mode (before any logger calls)
    if (resolvedProtocol === "stdio") {
      setLogLevel(LogLevel.ERROR);
    }

    const docService = await ensureDocServiceInitialized();
    const pipeline = await ensurePipelineManagerInitialized({
      recoverJobs: resume || false,
      serverUrl,
      concurrency: 3,
    });

    if (resolvedProtocol === "stdio") {
      // Direct stdio mode - bypass AppServer entirely
      logger.debug(`🔍 Auto-detected stdio protocol (no TTY)`);
      logger.info("🚀 Starting MCP server (stdio mode)");

      const mcpTools = await initializeTools(docService, pipeline);
      activeMcpStdioServer = await startStdioServer(mcpTools);

      await new Promise(() => {}); // Keep running forever
    } else {
      // HTTP mode - use AppServer
      const config: AppServerConfig = {
        enableWebInterface: false,
        enableMcpServer: true,
        enablePipelineApi: false,
        enableWorker: !serverUrl,
        port: Number.parseInt(cmdOptions.port),
        externalWorkerUrl: serverUrl,
      };

      activeAppServer = startAppServer(docService, pipeline, config);
      await activeAppServer;
      await new Promise(() => {});
    }
  });
```

### Phase 4: Logging Considerations

#### 4.1 Stdio Mode Logging

- **Critical**: Set log level to ERROR before any logger calls in stdio mode
- **Detection logging**: Only log protocol detection in http mode
- **Debug information**: Suppress all debug/info logs in stdio mode to prevent breaking stdio communication

#### 4.2 Error Handling

- Validation errors should use `console.error()` and `process.exit(1)`
- Server startup errors should be logged appropriately for the mode

## Backwards Compatibility

### Existing Commands Continue Working

- `docs-mcp-server --protocol stdio` → stdio mode (explicit)
- `docs-mcp-server --protocol http` → http mode (explicit)
- `docs-mcp-server mcp --server-url http://worker:8080/api` → external worker mode
- `docs-mcp-server worker` → external worker (unchanged)

### New Default Behavior

- `docs-mcp-server` → auto-detection (stdio in VS Code, http in terminal)
- `docs-mcp-server --resume` → resume jobs in auto-detected mode
- `docs-mcp-server mcp` → MCP-only mode without external dependencies

## Use Cases and Examples

### VS Code Integration

```json
{
  "mcpServers": {
    "docs-mcp-server": {
      "command": "docs-mcp-server",
      "args": []
    }
  }
}
```

**Result**: Auto-detects stdio mode, runs MCP server only, no job recovery

### Local Development

```bash
# Terminal usage
docs-mcp-server
```

**Result**: Auto-detects http mode, runs full unified server, no job recovery

### Resume Previous Jobs

```bash
docs-mcp-server --resume
```

**Result**: Auto-detects protocol, resumes interrupted jobs

### External Worker Setup

```bash
# Terminal 1: Start worker
docs-mcp-server worker --port 8080

# Terminal 2: Start coordinator (any mode)
docs-mcp-server --server-url http://localhost:8080/api
docs-mcp-server mcp --server-url http://localhost:8080/api
docs-mcp-server web --server-url http://localhost:8080/api
```

## Error Cases and Validation

### Invalid Flag Combinations

```bash
# ERROR: Resume with external worker
docs-mcp-server --resume --server-url http://localhost:8080/api
```

**Error**: `--resume flag is incompatible with --server-url`

### Invalid Protocol

```bash
docs-mcp-server --protocol invalid
```

**Error**: `Invalid protocol: invalid. Must be 'auto', 'stdio', or 'http'`

## Technical Implementation Notes

### Architectural Implementation

The implementation uses **two distinct code paths** for stdio vs HTTP modes:

#### Stdio Mode Architecture

- **Direct Transport**: Uses `StdioServerTransport` directly, bypassing all HTTP infrastructure
- **No AppServer**: Completely skips the AppServer/Fastify layer
- **Minimal Resources**: Only initializes DocumentManagementService, PipelineManager, and MCP tools
- **Variable Tracking**: Uses `activeMcpStdioServer` to track the stdio server instance

#### HTTP Mode Architecture

- **AppServer**: Uses the full AppServer with Fastify HTTP server
- **HTTP/SSE Transport**: MCP server accessible via `/sse` endpoint
- **Full Services**: Web interface, Pipeline API, and embedded/external worker support
- **Variable Tracking**: Uses `activeAppServer` which internally manages the HTTP-based MCP server

This separation ensures:

- **No Port Conflicts**: stdio mode never attempts to bind to HTTP ports
- **Clean Transport Separation**: Each transport uses its optimal implementation
- **Resource Efficiency**: stdio mode has minimal overhead
- **Maintainability**: Clear separation of concerns between transport layers

### TTY Detection Reliability

- VS Code typically runs commands without TTY when using `command` configuration
- Docker containers without `-t` flag will not have TTY
- CI/CD environments typically run without TTY
- Interactive terminals (bash, zsh, etc.) have TTY

### Service Configuration

- **stdio mode**: Direct stdio transport using `StdioServerTransport`, no HTTP server, minimal resource usage
- **http mode**: AppServer with HTTP/SSE endpoints, all services enabled for full functionality
- **External worker**: Delegates pipeline operations to remote API

### Job Recovery Logic

- Only applies to in-process workers (`serverUrl` not specified)
- External workers manage their own job recovery independently
- Default `false` ensures clean starts and concurrent safety

## Success Criteria

1. **Zero Configuration**: `docs-mcp-server` works immediately in VS Code without any parameters
2. **Backwards Compatibility**: All existing command patterns continue working
3. **No External Dependencies**: All modes work standalone without requiring `--server-url`
4. **Explicit Control**: `--resume` flag provides clear control over job recovery behavior
5. **Proper Logging**: Stdio mode suppresses logs, http mode provides appropriate feedback
6. **Error Validation**: Clear error messages for invalid flag combinations
7. **Protocol Override**: Manual protocol specification always respected

## Testing Requirements

### Automated Tests

- Protocol resolution function with various TTY states
- Flag validation logic for invalid combinations
- Service configuration based on resolved protocol
- Backwards compatibility for existing command patterns

### Manual Testing

- VS Code integration with default configuration
- Terminal usage with auto-detection
- External worker scenarios
- Error cases and validation messages
- Logging behavior in each mode

## Documentation Updates

### README.md

- Update "Quick Start" to show simple `docs-mcp-server` command
- Document auto-detection behavior
- Show VS Code configuration examples
- Explain `--resume` flag usage

### Help Text

- Update protocol option description to include "auto"
- Add `--resume` flag documentation
- Remove "required" language from `--server-url`
- Provide clear examples for each mode

This PRD provides a complete specification for implementing auto protocol detection and explicit job recovery control, ensuring seamless VS Code integration while maintaining full backwards compatibility and removing external dependency friction.
