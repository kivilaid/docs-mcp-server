# Pipeline API Architecture Refactoring - Product Requirements Document

## Overview

This PRD outlines the architectural refactoring of the docs-mcp-server pipeline management system to address multi-process coordination issues. The solution implements a **hybrid architecture** with intelligent pipeline selection that provides excellent user experience for simple use cases while enabling scaling for production deployments.

## Problem Statement

Currently, the application can start in four different modes, each instantiating its own `PipelineManager`:

- **MCP server via HTTP** (`mcp --protocol http`)
- **MCP server via stdio** (`mcp --protocol stdio`)
- **Web interface** (`web`)
- **CLI** (various commands)

This causes critical issues:

1. **Duplicate Job Recovery**: Each pipeline manager recovers the same pending jobs from the database on startup
2. **Resource Conflicts**: Multiple processes attempt to process the same jobs simultaneously
3. **Progress Tracking Inconsistency**: Progress updates are stored in memory and don't sync across processes
4. **State Fragmentation**: Job status and progress are inconsistent between processes

## Solution: Hybrid Architecture

The solution implements intelligent pipeline management with these core principles:

1. **Unified Server** (Default): Single process running MCP server + Web interface + embedded worker on one port
2. **CLI In-Process Execution**: CLI commands run PipelineManager in-process for immediate execution and great UX
3. **External Worker for Scaling**: Optional separate worker service for production deployments
4. **Smart Pipeline Selection**: Automatic selection between embedded and external pipeline management based on context

## Architecture Goals

1. **Excellent First-Time Experience**: Single command (`docs-mcp-server`) provides full functionality on one port
2. **CLI Simplicity**: `docs-mcp-server scrape react` works immediately without setup
3. **Unified Interface**: Web interface and MCP server on same port - zero configuration
4. **Optional Scaling**: Can separate worker when needed for production deployments
5. **No Breaking Changes**: All existing workflows continue to work
6. **Clean Separation**: Complete separation between pipeline logic and interface logic
7. **Container-Native**: Perfect fit for Docker/container deployments

## Critical Implementation Concepts

### Functionality-Based Pipeline Selection

The core of the hybrid architecture is intelligent pipeline selection based on desired functionality rather than usage context:

```typescript
// Clean, functionality-based pipeline creation
export namespace PipelineFactory {
  export async function createPipeline(
    docService: DocumentManagementService,
    options: PipelineOptions = {}
  ): Promise<IPipeline> {
    const {
      recoverJobs = false, // Default to false for safety
      serverUrl,
      concurrency = DEFAULT_MAX_CONCURRENCY,
    } = options;

    if (serverUrl) {
      // External pipeline requested
      return new PipelineClient(serverUrl);
    }

    // Local embedded pipeline with specified behavior
    return new PipelineManager(docService, concurrency, { recoverJobs });
  }
}

// Usage examples:
// CLI: Fast, isolated execution
const pipeline = await PipelineFactory.createPipeline(docService, {
  recoverJobs: false,
});

// MCP Server: Persistent, recovers jobs
const pipeline = await PipelineFactory.createPipeline(docService, {
  recoverJobs: true,
});

// External worker mode
const pipeline = await PipelineFactory.createPipeline(docService, {
  serverUrl: "http://worker:8080/api",
});
```

### Job Recovery Coordination

**CRITICAL**: Only ONE process should have `recoverJobs: true` running at any time:

- **Unified Server (Default Mode)**: `{ recoverJobs: true }`
- **External Worker**: `{ recoverJobs: true }`
- **CLI Commands**: `{ recoverJobs: false }` (immediate execution only)
- **Legacy MCP/Web modes**: Use existing patterns for backward compatibility

### Process Behavior Types

Each process type has specific pipeline behavior based on functionality requirements:

| Functionality        | Pipeline Type   | Job Recovery | Use Case              |
| -------------------- | --------------- | ------------ | --------------------- |
| `recoverJobs: true`  | PipelineManager | Yes          | Unified Server/Worker |
| `recoverJobs: false` | PipelineManager | No           | CLI Commands          |
| `serverUrl: "..."`   | PipelineClient  | N/A          | External Worker       |

### Architectural Separation of Concerns

**Critical Phase 2 Fix**: Proper separation between coordination and execution layers:

- **CLI Tools (ScrapeTool, etc.)**: Handle job coordination, parameter validation, and delegation
- **Pipeline Workers (PipelineWorker)**: Handle all data operations including document clearing, scraping, and storage
- **Process Boundary**: Document clearing moved from CLI process to worker process for clean separation

This ensures that when using external workers:

- CLI coordinates the job but doesn't touch the database
- External worker handles all data operations in its own process/container
- No cross-process data consistency issues

## Target Architecture

### Default Mode: Unified Server (Single Port)

```
┌─────────────────┐    ┌─────────────────┐
│   CLI Commands  │    │  External Tools │
│                 │    │ (VS Code, etc.) │
└─────────┬───────┘    └─────────┬───────┘
          │ In-process                   │ MCP Protocol
          │ execution                    │ (/sse endpoint)
          └─────────────────────────────┼───────┐
                                        │       │
          ┌─────────────────────────────▼───────▼─────┐
          │        Unified Server (port 6280)         │
          │  ┌─────────────────────────────────────┐  │
          │  │         Fastify Server              │  │
          │  │  ┌─────────────────────────────────┐│  │
          │  │  │     Web Routes (/, /jobs)       ││  │
          │  │  └─────────────────────────────────┘│  │
          │  │  ┌─────────────────────────────────┐│  │
          │  │  │     MCP Routes (/sse)           ││  │
          │  │  └─────────────────────────────────┘│  │
          │  │  ┌─────────────────────────────────┐│  │
          │  │  │     Static Assets (/assets)     ││  │
          │  │  └─────────────────────────────────┘│  │
          │  └─────────────────────────────────────┘  │
          │  ┌─────────────────────────────────────┐  │
          │  │     Embedded PipelineManager       │  │
          │  │   - Job queue management            │  │
          │  │   - Worker concurrency              │  │
          │  │   - Job recovery on startup         │  │
          │  └─────────────────────────────────────┘  │
          └───────────────────────────────────────────┘
```

### Scaling Mode: External Worker

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Unified Server│    │   CLI Commands  │    │  External Tools │
│   (Coordinator) │    │                 │    │ (VS Code, etc.) │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │ Web UI + MCP         │ In-process           │ MCP Protocol
          │ (port 6280)          │ execution            │ (/sse endpoint)
          └──────────────────────┼──────────────────────┼───────┐
                                 │                      │       │
                    ┌─────────────▼──────────────────────▼───────▼─┐
                    │       Unified Server (Coordinator)           │
                    │   ┌─────────────────────────────────────┐    │
                    │   │         PipelineClient             │    │
                    │   │   - Delegates to external worker   │    │
                    │   └─────────────────────────────────────┘    │
                    └─────────────────┬────────────────────────────┘
                                      │ HTTP API calls
                                      │
                    ┌─────────────────▼────────────────────────────┐
                    │              External Worker                 │
                    │   ┌─────────────────────────────────────┐    │
                    │   │         PipelineManager             │    │
                    │   │   - Job queue management            │    │
                    │   │   - Worker concurrency              │    │
                    │   │   - Job recovery on startup         │    │
                    │   └─────────────────────────────────────┘    │
                    └──────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Create Functionality-Based Pipeline Selection (COMPLETED ✅)

**Goal**: Implement the PipelineFactory that intelligently selects between embedded and external pipeline management based on desired functionality.

**Key Components Created:**

```typescript
// src/pipeline/interfaces.ts
export interface PipelineOptions {
  /** Whether this pipeline should recover interrupted jobs on startup */
  recoverJobs?: boolean;
  /** URL of external pipeline server (if using remote pipeline) */
  serverUrl?: string;
  /** Maximum concurrent jobs */
  concurrency?: number;
}

// src/pipeline/PipelineFactory.ts
export namespace PipelineFactory {
  export async function createPipeline(
    docService: DocumentManagementService,
    options: PipelineOptions = {}
  ): Promise<IPipeline>;
}
```

**Tasks Completed:**

- [x] Create `src/pipeline/interfaces.ts` with functionality-based options
- [x] Create `src/pipeline/PipelineFactory.ts` with smart selection logic
- [x] Update `src/mcp/mcpServer.ts` to use PipelineFactory with `{ recoverJobs: true }`
- [x] Update `src/index.ts` CLI commands to use PipelineFactory with `{ recoverJobs: false }`
- [x] Update `src/web/index.ts` to require `--server-url` parameter
- [x] Update PipelineManager constructor to support `{ recoverJobs }` option

**Success Criteria Achieved:**

- [x] All processes use PipelineFactory for pipeline creation
- [x] Job recovery only occurs in MCP server (embedded) mode when explicitly enabled
- [x] CLI commands run in-process without job recovery
- [x] Web interface requires `--server-url` parameter and shows helpful error
- [x] All existing tests pass (499/499 ✅)
- [x] Functionality-based interface is cleaner and more maintainable

### Phase 2: External Worker Support (COMPLETED ✅)

**Goal**: Add HTTP API and client support for external worker scaling.

**Key Components Created:**

```typescript
// src/pipeline/PipelineClient.ts
export class PipelineClient implements IPipeline {
  // HTTP API client that matches PipelineManager interface
  // Simplified URL handling: accepts full API URLs directly
  constructor(serverUrl: string) {
    this.baseUrl = serverUrl.replace(/\/$/, ""); // Remove trailing slash only
  }
}

// src/pipeline/PipelineApiService.ts
export class PipelineApiService {
  // HTTP API endpoints for job operations
}
```

**URL Handling Simplification:**

The PipelineClient has been simplified to accept full API URLs directly:

- **Before**: Complex URL parsing with base URLs vs API endpoints
- **After**: Simple approach - users provide the complete API URL
- **Example**: `--server-url http://localhost:6280/api` (full API endpoint)
- **Implementation**: `this.baseUrl = serverUrl.replace(/\/$/, "")` (removes only trailing slash)

**Tasks Completed:**

- [x] Create `src/pipeline/PipelineClient.ts` with HTTP API client
- [x] Create `src/pipeline/PipelineApiService.ts` with RESTful endpoints
- [x] Add external worker command to `src/index.ts`
- [x] Implement health check endpoints
- [x] Update CLI commands to support `--server-url` parameter
- [x] Update PipelineFactory to create PipelineClient when serverUrl provided
- [x] Fix architectural separation: Move document clearing from CLI to worker
- [x] Add comprehensive test coverage for new components

**Success Criteria Achieved:**

- [x] External worker runs as standalone HTTP service
- [x] PipelineClient provides identical interface to PipelineManager
- [x] API endpoints handle all job operations (create, list, cancel, etc.)
- [x] CLI commands can delegate to external worker via `--server-url`
- [x] End-to-end workflow: CLI → PipelineClient → External Worker → Job Completion
- [x] Document clearing happens in worker process (not CLI) for proper separation
- [x] Test coverage: PipelineFactory.test.ts, PipelineClient.test.ts, PipelineApiService.test.ts
- [x] All 499+ tests pass with new architecture

### Phase 3: Process Integration (COMPLETED ✅)

**Goal**: Update all processes to use the hybrid architecture with functionality-based pipeline selection.

**Tasks Completed:**

- [x] MCP Server: Support `--server-url` parameter for external worker
- [x] CLI Commands: Always use in-process PipelineManager (no external dependencies)
- [x] Web Interface: Require `--server-url` parameter, show helpful error message
- [x] Remove context-specific initialization from client processes
- [x] Verify architectural separation of concerns (CLI coordination vs worker execution)

**Success Criteria Achieved:**

- [x] MCP server works with both embedded mode (default) and external worker (via `--server-url`)
- [x] CLI commands work immediately without any setup
- [x] Web interface shows clear error message requiring `--server-url`
- [x] No breaking changes to existing command-line interface
- [x] Clean separation: CLI tools coordinate, workers execute data operations
- [x] Document clearing moved from ScrapeTool to PipelineWorker for proper architecture

### Phase 4: Unified Server Implementation (COMPLETED ✅)

**Goal**: Create unified server that runs MCP + Web interface + embedded worker on single port.

**Key Components Created:**

```typescript
// src/app/AppServer.ts
export class AppServer {
  private server: FastifyInstance;
  private config: AppServerConfig;

  constructor(config: AppServerConfig) {
    this.config = this.validateConfig(config);
  }

  async start(): Promise<void> {
    // Initialize Fastify with modular service registration
    // Register services based on boolean configuration flags
  }

  private async setupServer(): Promise<void> {
    if (this.config.enableWebInterface) this.enableWebInterface();
    if (this.config.enableMcpServer) await this.enableMcpServer();
    if (this.config.enablePipelineApi) await this.enablePipelineApi();
    if (this.config.enableWorker) await this.enableWorker();
  }
}

// src/app/AppServerConfig.ts
export interface AppServerConfig {
  enableWebInterface: boolean;
  enableMcpServer: boolean;
  enablePipelineApi: boolean;
  enableWorker: boolean;
  port: number;
  externalWorkerUrl?: string;
}
```

**Tasks Completed:**

- [x] Create unified server command as new default for `docs-mcp-server`
- [x] Create `src/app/AppServer.ts` with modular service composition:
  - [x] Integrate web routes with `/web-api/` prefix (avoiding conflicts)
  - [x] Add MCP server with `/sse` endpoint for AI tool integration
  - [x] Add Pipeline API routes with `/api/` prefix for programmatic access
  - [x] Add worker service for embedded job processing
- [x] Resolve route conflicts between web interface and Pipeline API
- [x] Update web interface to use `/web-api/` prefix for HTMX calls
- [x] Maintain all static asset serving from `/assets/` prefix
- [x] Update CLI to support unified server via boolean service flags
- [x] Maintain backward compatibility with separate `mcp`, `web`, and `worker` commands
- [x] Add unified server to `src/index.ts` as default action (no subcommand)
- [x] Configure unified server via CLI arguments with sensible defaults

**Route Structure for Unified Server:**

```
http://localhost:6280/
├── /                    # Web interface (HTML pages)
├── /web-api/jobs       # Web interface job management API (HTMX)
├── /web-api/libraries  # Web interface library management API (HTMX)
├── /assets/            # Static files (CSS, JS, images)
├── /sse               # MCP Server-Sent Events endpoint
├── /api/              # Pipeline API (programmatic access)
    ├── /health        # Health checks
    ├── /jobs          # Job management API
    └── ...
```

**Implementation Details:**

- **Fixed Port 6280**: AI tools need consistent configuration, achieved via AppServer
- **MCP Endpoint**: Uses `/sse` path for Server-Sent Events integration
- **Route Separation**: Web interface uses `/web-api/` prefix, Pipeline API uses `/api/` prefix
- **Static Assets**: Served from `/assets/` prefix to avoid conflicts
- **Service Registration**: Modular function-based pattern for clean separation

**Critical Integration Points Achieved:**

- **AppServer Architecture**: Central server with boolean-based service composition
- **Service Registration**: Clean function-based pattern (`registerWebService`, `registerMcpService`, etc.)
- **Route Namespace Separation**: Resolved conflicts between web interface and Pipeline API
- **Modular Configuration**: `AppServerConfig` interface with boolean flags for each service
- **CLI Command Structure**: Default unified command plus explicit service commands
- **Static File Serving**: Uses `@fastify/static` with `/assets/` prefix from `public/` directory

**Technical Implementation Achieved:**

1. **Enhanced AppServer**: Extended with modular service registration and configuration validation
2. **Service Functions**: Converted all services to function-based registration pattern
3. **Route Prefixes**: Added `/web-api/` namespace for HTMX web interface calls
4. **Boolean Configuration**: Simple `enableWebInterface`, `enableMcpServer`, `enablePipelineApi`, `enableWorker` flags
5. **CLI Simplification**: Reduced main CLI from 844 lines to clean AppServer-based commands

**Architecture Benefits Achieved:**

- **Zero Configuration**: Single command starts everything on one port
- **Simplified Documentation**: One URL for web + MCP (http://localhost:6280)
- **Better Resource Usage**: No inter-process HTTP overhead
- **Easier Development**: One server to manage
- **Modular Design**: Services can be enabled/disabled via boolean flags

**Command Structure Implemented:**

```bash
# NEW: Unified server (default) - IMPLEMENTED ✅
docs-mcp-server                    # Web UI + MCP + Worker on :6280
docs-mcp-server --port 8080        # Custom port
docs-mcp-server --no-web          # MCP + Worker only
docs-mcp-server --no-mcp          # Web + Worker only
docs-mcp-server --external-worker-url http://localhost:8080  # Use external worker

# EXISTING: Backward compatibility - MAINTAINED ✅
docs-mcp-server mcp --protocol http    # MCP only
docs-mcp-server web --server-url ...   # Web only
docs-mcp-server worker                 # Worker only
```

**Success Criteria Achieved:**

- [x] Unified server runs on single port with all services
- [x] MCP endpoint available at `/sse` for AI tool integration
- [x] Web interface available with job management and library management
- [x] Pipeline API available at `/api/` for programmatic access
- [x] Route conflicts resolved via namespace separation
- [x] Static assets served correctly from `/assets/` prefix
- [x] All 521 tests pass with new architecture
- [x] Backward compatibility maintained for all existing commands
- [x] Build successful and runtime validation completed

**Success Criteria:**

- [ ] Single process serves both web interface and MCP protocol
- [ ] MCP endpoint available at `/sse` on same port as web interface
- [ ] Pipeline API available at `/api/*` for CLI and programmatic access
- [ ] CLI commands work with unified server via `--server-url`
- [ ] Existing separate commands remain functional
- [ ] Configuration via CLI arguments only
- [ ] Static assets served from `/assets/` prefix without breaking web UI
- [ ] Proper error handling for port conflicts with alternative suggestions
- [ ] All existing web routes (/, /jobs, /libraries) continue working
- [ ] MCP transport reuses existing SDK components via Fastify raw handlers

### Phase 5: Deployment and Documentation

### Phase 5: Deployment and Documentation

**Goal**: Update deployment configurations and documentation for the unified architecture.

**Tasks:**

- [ ] Update Docker Compose examples for unified server approach
- [ ] Update health checks and service dependencies
- [ ] Update README.md for unified server as primary setup method
- [ ] Update ARCHITECTURE.md to reflect unified server architecture
- [ ] Document migration path and backward compatibility
- [ ] Update MCP client configuration examples (single URL)
- [ ] Update web interface access instructions (same port as MCP)
- [ ] Revise Docker examples to show simplified single-service deployment

**Documentation Priority Changes:**

**README.md Updates:**

- [ ] **"Recommended: Unified Server"** section as primary setup method
- [ ] Move current Docker Compose to **"Alternative: Multi-Service Setup"**
- [ ] Update MCP client config examples to use single URL: `http://localhost:6280/sse`
- [ ] Update web interface access: `http://localhost:6280` (not separate port)
- [ ] Simplify "Get started quickly" section with unified approach
- [ ] Update all command examples to show unified server first

**ARCHITECTURE.md Updates:**

- [ ] Add **"Unified Server Architecture"** section
- [ ] Document single Fastify instance serving multiple interfaces
- [ ] Update component interaction diagrams for unified approach
- [ ] Document static asset serving from `/assets/` prefix
- [ ] Update MCP server implementation to reflect Fastify integration

**Docker Configuration Updates:**

- [ ] **Default docker-compose.yml**: Single service on port 6280
- [ ] **Alternative docker-compose.yml**: Multi-service for scaling
- [ ] Update service health checks for unified endpoint
- [ ] Simplify environment variable configuration

**Docker Examples:**

**Default (Unified Server):**

```yaml
services:
  docs-mcp-server:
    command: ["docs-mcp-server", "--port", "6280"]
    ports:
      - "6280:6280"
    # Single service provides both web UI and MCP endpoint
```

**Scaling (Multi-Container):**

```yaml
services:
  worker:
    command: ["docs-mcp-server", "worker", "--port", "8080"]
  unified-server:
    command:
      [
        "docs-mcp-server",
        "--port",
        "6280",
        "--server-url",
        "http://worker:8080/api",
      ]
    ports:
      - "6280:6280"
```

**Success Criteria:**

- [ ] Unified server deployment works out of the box
- [ ] README.md shows unified server as primary ("Recommended") setup method
- [ ] All MCP client examples use single URL: `http://localhost:6280/sse`
- [ ] Web interface examples use same port: `http://localhost:6280`
- [ ] Docker Compose simplified to single service by default
- [ ] Clear migration path for existing Docker Compose users
- [ ] Perfect backward compatibility maintained (separate commands still work)
- [ ] Documentation reflects unified architecture approach
- [ ] ARCHITECTURE.md updated with unified server design patterns

## Configuration Examples

### Command Examples

```bash
# NEW: Unified server (recommended)
docs-mcp-server                           # Web UI + MCP on :6280 (auto-detect port)
docs-mcp-server --port 8080               # Custom port for unified server

# MCP Integration
# Configure AI tools to use: http://localhost:6280/sse

# CLI: In-process execution (simple, immediate)
docs-mcp-server scrape react https://react.dev

# CLI: Use unified server (persistent jobs, visible in web UI)
docs-mcp-server scrape react https://react.dev --server-url http://localhost:6280

# EXISTING: Backward compatibility
docs-mcp-server mcp --protocol http --port 6280    # MCP only
docs-mcp-server web --server-url http://localhost:6280  # Web only

# Scaling: External worker for production
docs-mcp-server worker --port 8080
docs-mcp-server --port 6280 --server-url http://localhost:8080
```

### Migration Strategy

**Perfect Backward Compatibility:**

- All existing commands work exactly as before
- `docs-mcp-server mcp --protocol http` works as before
- `docs-mcp-server scrape react` works immediately without setup
- New unified server becomes the recommended default approach

**Migration Path:**

1. **Phase 1**: Use embedded worker (current + new functionality) ✅
2. **Phase 2**: Add external worker support + architectural fixes ✅
3. **Phase 3**: Process integration with hybrid architecture ✅
4. **Phase 4**: Unified server implementation ✅
5. **Phase 5**: Update documentation and deployment configs

**User Experience Improvements:**

- **Before**: `docker compose up` + configure MCP: `http://localhost:6280/sse` + web: `http://localhost:6281`
- **After**: `docs-mcp-server` + configure everything: `http://localhost:6280` (MCP: `/sse`, Web: `/`)

**Documentation Transition:**

- **Before**: Complex multi-service setup as "Recommended"
- **After**: Simple unified server as "Recommended", multi-service as "Alternative: Scaling"

No breaking changes - pure additive functionality with dramatically improved UX.

### Phase 4 Implementation Notes

**Key Architectural Decisions Made:**

1. **AppServer vs UnifiedServer**: Chose to enhance existing `AppServer.ts` rather than create new `UnifiedServer.ts`

   - Leveraged existing Fastify infrastructure
   - Maintained compatibility with existing service registration patterns
   - Reduced code duplication and complexity

2. **Route Namespace Separation**: Implemented `/web-api/` and `/api/` prefixes

   - **Problem**: Duplicate route conflicts between web interface and Pipeline API
   - **Solution**: Web interface HTMX calls use `/web-api/` prefix, Pipeline API uses `/api/` prefix
   - **Benefit**: Clean separation of concerns without breaking existing API contracts

3. **Function-Based Service Registration**: Converted to modular service functions

   - `registerWebService()`, `registerMcpService()`, `registerPipelineApiService()`, `registerWorkerService()`
   - **Benefit**: Clean separation, easier testing, better maintainability

4. **Boolean Configuration Pattern**: Simple enable/disable flags

   - `enableWebInterface`, `enableMcpServer`, `enablePipelineApi`, `enableWorker`
   - **Benefit**: Clear, self-documenting configuration without complex option objects

5. **CLI Command Structure**: Enhanced default action with explicit service commands
   - Default: All services enabled on port 6280
   - Explicit: `mcp`, `web`, `worker` commands for specific use cases
   - **Benefit**: Zero-configuration default with flexibility for advanced users

**Technical Debt Resolved:**

- Eliminated 844-line monolithic CLI entry point
- Centralized server configuration in clean interface
- Resolved route conflicts proactively
- Unified all service registration patterns

### Phase 5: Documentation and Deployment Updates (READY)

**Goal**: Update all documentation and deployment configurations to reflect the new unified server architecture.

**Documentation Updates Needed:**

- [ ] Update `README.md` installation and usage sections
- [ ] Update `ARCHITECTURE.md` with AppServer-centric design
- [ ] Update Docker configuration for unified server
- [ ] Update deployment examples and configuration guides
- [ ] Create migration guide for existing users

**Deployment Configuration Updates:**

- [ ] Update `docker-compose.yml` to use unified server by default
- [ ] Update Dockerfile to use new default command
- [ ] Update environment variable documentation
- [ ] Create scaling examples (unified + external worker)

**Success Criteria:**

- [ ] New users can get started with single command
- [ ] Existing users have clear migration path
- [ ] Documentation reflects actual implementation
- [ ] Deployment configs match new architecture

**Behavioral Test Coverage Added:**

- **PipelineFactory.test.ts**: Smart pipeline selection based on functionality requirements
- **PipelineClient.test.ts**: HTTP delegation, error handling, polling behavior, connection management
- **PipelineApiService.test.ts**: REST API contract, HTTP status codes, JSON serialization
- **PipelineWorker.test.ts**: Updated to verify document clearing happens in worker process

**Testing Philosophy:**

- Focus on behavior validation, not implementation details
- Test critical failure modes and error handling
- Minimal overlap, high-value test coverage
- Maintainable tests that won't break with refactoring

### Key Implementation Details for LLM

### Critical Implementation Points

1. **PipelineFactory**: Core component that implements functionality-based pipeline selection ✅
2. **Functionality-Based Options**: `{ recoverJobs, serverUrl, concurrency }` instead of context strings ✅
3. **Job Recovery**: Only unified server (embedded) and external worker recover jobs ✅
4. **Configuration**: Simple `--server-url` parameter for connections ✅
5. **Error Handling**: Web interface requires `--server-url`, others have sensible defaults ✅
6. **AppServer Architecture**: Central modular server with boolean service composition ✅
7. **Port Management**: Fixed port 6280 (AI tools need consistent configuration) ✅
8. **Backward Compatibility**: Separate `mcp`, `web`, and `worker` commands remain available ✅

### User Experience Priorities

1. **First-time users**: `docs-mcp-server` provides everything on one port immediately ✅
2. **CLI simplicity**: `docs-mcp-server scrape react https://react.dev` works without setup ✅
3. **Zero configuration**: Web interface and MCP endpoint on same port ✅
4. **Production scaling**: External worker available when needed ✅
5. **No breaking changes**: All existing workflows continue working ✅

### Architectural Improvements Made

1. **Functionality-Based Design**: Replaced context strings (`'mcp'`, `'web'`) with declarative options (`{ recoverJobs: true }`) ✅
2. **Cleaner Interface**: Self-documenting pipeline configuration ✅
3. **Better Maintainability**: Easy to add new options without changing factory signature ✅
4. **Type Safety**: Strong typing for all pipeline options ✅
5. **Test Coverage**: All 521 tests pass, ensuring robustness ✅
6. **AppServer Architecture**: Central server with modular service composition ✅
7. **Route Namespace Separation**: Resolved API conflicts with `/web-api/` and `/api/` prefixes ✅
