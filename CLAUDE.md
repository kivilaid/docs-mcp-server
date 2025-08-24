# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Local Development Setup

### Quick Start Guide

1. **Prerequisites**: Node.js 20.0.0+ required
2. **Install dependencies**: `npm install`
3. **Environment setup**: Create `.env` file with at least:
   ```bash
   OPENAI_API_KEY=your-openai-api-key
   DOCS_MCP_EMBEDDING_MODEL=text-embedding-3-small
   ```
4. **Start development server**: 
   - For **web interface development**: `npm run dev:web` → http://localhost:6281
   - For **MCP server development**: `npm run dev:server` → http://localhost:6280

### Environment Variables Setup

**Required for basic functionality:**
- `OPENAI_API_KEY`: Your OpenAI API key for embeddings
- `DOCS_MCP_EMBEDDING_MODEL`: Model to use (default: `text-embedding-3-small`)

**Alternative embedding providers:**
```bash
# Local Ollama
OPENAI_API_KEY=ollama
OPENAI_API_BASE=http://localhost:11434/v1
DOCS_MCP_EMBEDDING_MODEL=nomic-embed-text

# Google Gemini
GOOGLE_API_KEY=your-google-api-key
DOCS_MCP_EMBEDDING_MODEL=gemini:embedding-001

# See README.md for Azure, AWS, and Vertex AI configurations
```

**Optional configurations:**
- `DOCS_MCP_STORE_PATH`: Custom database storage path
- `DOCS_MCP_EMBEDDING_BATCH_CHARS`: Embedding batch size (default: 50000)

## Development Commands

### Core Build & Test Commands
```bash
npm run build        # Build both web assets and main application
npm run test         # Run tests once
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
npm run lint         # Check code with Biome
npm run lint:fix     # Fix linting issues automatically
npm run format       # Format code with Biome
```

### Development Servers
```bash
# RECOMMENDED: Full web development with proper UI (port 6281)
npm run dev:web              # Start web interface + assets with hot reload
                            # Runs two processes: asset building + web server
                            # Access at: http://localhost:6281

# MCP server development (port 6280)  
npm run dev:server            # Auto-detects protocol (stdio for AI tools, HTTP for terminals)
npm run dev:server:stdio      # Force stdio protocol (for AI tool integration)
npm run dev:server:http       # Force HTTP protocol (for browser testing)

# Individual processes (advanced)
npm run dev:web:bin          # Web interface only (needs assets built separately)
npm run dev:web:assets       # Build web assets in watch mode only
```

### Important Port Notes
- **Web Interface Development**: Use port **6281** with `npm run dev:web`
- **MCP Server Development**: Uses port **6280** with `npm run dev:server:*`
- **Production Unified Server**: Uses port **6280** (both web + MCP)

**⚠️ Common Mistake**: `npm run dev:server:http` gives you a basic server on port 6280, but the web interface won't have proper styling/functionality. Always use `npm run dev:web` for web interface development!

### Production Commands
```bash
npm start            # Start production server (requires build)
npm run web          # Start web interface only
npm run cli          # Run CLI commands
```

### CLI Usage Examples

**For Development (source code):**
```bash
# List indexed libraries
npx vite-node src/index.ts list

# Search documentation  
npx vite-node src/index.ts search react "useState hook"

# Scrape new documentation
npx vite-node src/index.ts scrape react https://react.dev/reference/react

# Start web interface on custom port
npx vite-node src/index.ts web --port 3001
```

**For Production (built files):**
```bash
# First build the project
npm run build

# Then use built CLI
npm run cli list
npm run cli search react "useState hook"  
npm run cli scrape react https://react.dev/reference/react
npm run cli web --port 3001
```

### Docker Development
```bash
# Build and run standalone server
docker run --rm -e OPENAI_API_KEY="your-key" -v docs-mcp-data:/data -p 6280:6280 \
  ghcr.io/arabold/docs-mcp-server:latest --protocol http --port 6280

# Scale with Docker Compose (requires cloning repo for docker-compose.yml)
export OPENAI_API_KEY="your-key"
docker compose up -d
docker compose up -d --scale worker=3  # Scale workers
```

## Architecture Overview

The docs-mcp-server follows a layered architecture designed for modularity and reusability:

```
Access Layer (CLI, Web UI, MCP Server)
    ↓
Tools Layer (Business Logic - Shared across all interfaces)
    ↓
Pipeline Layer (Job Processing - Embedded or Distributed)
    ↓
Content Processing (Scraper → Splitter → Embedder)
    ↓
Storage Layer (DocumentManagement → DocumentStore → SQLite)
```

### Key Architectural Patterns

**Protocol Auto-Detection**: Entry point detects TTY status and chooses stdio (for AI tools) or HTTP (for interactive use) automatically. Override with `--protocol stdio|http`.

**Pipeline Selection**: `PipelineFactory` chooses implementation based on configuration:
- `serverUrl` present → `PipelineClient` (connects to external worker via tRPC)
- `recoverJobs: true` → `PipelineManager` (in-process with job recovery)
- `recoverJobs: false` → `PipelineManager` (in-process, no recovery)

**Write-Through Architecture**: Pipeline jobs serve as single source of truth, with all state changes immediately persisted to database for recovery capability.

**Functionality-Based Design**: Components selected based on capability requirements rather than deployment context.

## Core Components

### Tools Layer (`src/tools/`)
Central business logic hub that all interfaces delegate to. Implements:
- Document scraping with configuration persistence (`ScrapeTool.ts`)
- Semantic search across indexed content (`SearchTool.ts`)
- Library and version management (`ListLibrariesTool.ts`)
- Job lifecycle management (`CancelJobTool.ts`, `GetJobInfoTool.ts`)
- URL fetching and processing (`FetchUrlTool.ts`)

**Key Pattern**: All CLI commands, MCP endpoints, and web routes delegate to these shared tools to eliminate duplicate business logic.

### Pipeline Management (`src/pipeline/`)
Handles asynchronous job processing with persistent state:
- **PipelineManager**: Coordinates job queue, manages concurrency, synchronizes state
- **PipelineWorker**: Executes individual jobs, reports progress via callbacks
- **PipelineClient**: tRPC client providing identical interface for external workers

Job states: `QUEUED → RUNNING → COMPLETED/FAILED/CANCELLED`

### Content Processing (`src/scraper/`)
Middleware pipeline pattern for content transformation:

1. **Fetcher** (`fetcher/`): HTTP, file://, package registry content retrieval
2. **Middleware Chain** (`middleware/`): Parsing, metadata extraction, link processing
3. **Pipeline Selection** (`pipelines/`): HTML or Markdown processing based on content type
4. **Splitter** (`../splitter/`): Semantic chunking preserving document structure
5. **Embedder** (`../store/embeddings/`): Vector embedding generation

### Storage Architecture (`src/store/`)
SQLite database with normalized schema:
- `libraries`: Library metadata and organization
- `versions`: Version tracking, indexing status, scraper configuration (job state hub)
- `documents`: Content chunks with embeddings and metadata

**DocumentManagementService**: CRUD operations and version resolution
**DocumentRetrieverService**: Search combining vector similarity + full-text search

### Web Interface (`src/web/`)
Server-side rendered with JSX components:
- **Fastify** server with JSX rendering
- **HTMX** for dynamic updates without client JS frameworks
- **AlpineJS** for component-level interactivity
- **TailwindCSS** + **Flowbite** for styling

Components poll for job status every 3 seconds, displaying real-time progress.

### MCP Protocol Integration (`src/mcp/`)
Exposes tools as MCP-compliant endpoints:
- **stdio transport**: For AI tools and CLI embedding
- **HTTP transport**: Provides `/mcp` (Streamable HTTP) and `/sse` (Server-Sent Events)

Available MCP tools mirror CLI functionality with identical interfaces.

## Development Guidelines

### Code Organization Principles
- **Tools implement business logic** with interface-agnostic design
- **Pipeline components** handle asynchronous processing concerns
- **Storage layer** abstracts database operations with migration support
- **Interfaces delegate to tools** rather than implementing logic directly

### Testing Strategy
- Focus on **public API behavior** and observable side effects
- **Mock only external dependencies** (databases, APIs, filesystem)
- Tests should **remain stable across refactoring** by avoiding implementation details
- Use **vitest** for all testing

### Error Handling
- Errors propagate through tools layer with context preservation
- Job failures store detailed error information in database for debugging
- Use hierarchical error handling: Tools → Core → Processing layers

### Logging Hierarchy
- **Tools layer**: User-facing operations and results
- **Core components**: Operational status and state changes  
- **Processing layer**: Detailed progress and error conditions
- Use `console.*` for direct user output, `logger.*` for application events

### Multi-Provider Embedding Support
The system supports various embedding providers via environment variables:
- **OpenAI**: `OPENAI_API_KEY` + `DOCS_MCP_EMBEDDING_MODEL="text-embedding-3-small"`
- **Google Gemini**: `GOOGLE_API_KEY` + `DOCS_MCP_EMBEDDING_MODEL="gemini:embedding-001"`  
- **Google Vertex AI**: `GOOGLE_APPLICATION_CREDENTIALS` + `DOCS_MCP_EMBEDDING_MODEL="vertex:text-embedding-004"`
- **AWS Bedrock**: AWS credentials + `DOCS_MCP_EMBEDDING_MODEL="aws:amazon.titan-embed-text-v1"`
- **Azure OpenAI**: Azure credentials + `DOCS_MCP_EMBEDDING_MODEL="microsoft:text-embedding-ada-002"`
- **Local Ollama**: `OPENAI_API_BASE="http://localhost:11434/v1"` + model name

### Database Migrations
Located in `db/migrations/` with sequential numbering. Use `applyMigrations.ts` for schema changes. The migration system ensures consistent database state across deployments.

### Extension Points
When adding new functionality:
- **Implement core logic in tools layer** for interface reuse
- **Add pipeline workers** for new content processing types
- **Extend scraper middleware** for additional content sources
- **Use migration system** for schema changes
- **Follow write-through pattern** for job state management

## Important File Locations

- **Main entry point**: `src/index.ts` → `src/cli/main.ts`
- **CLI commands**: `src/cli/commands/`
- **MCP server**: `src/mcp/mcpServer.ts`
- **Web routes**: `src/web/routes/`
- **Business logic**: `src/tools/`
- **Database migrations**: `db/migrations/`
- **Configuration**: `src/utils/config.ts`
- **Type definitions**: `src/types/`

## Technology Stack
- **Runtime**: Node.js 22.x with TypeScript
- **Build**: Vite with TypeScript compilation
- **Testing**: Vitest 
- **Linting/Formatting**: Biome
- **Web**: Fastify + JSX + HTMX + AlpineJS + TailwindCSS
- **Database**: SQLite with sqlite-vec for vector operations
- **AI**: LangChain.js for embeddings, Playwright for web scraping
- **Communication**: tRPC for worker coordination
- **Protocol**: Model Context Protocol (MCP) SDK

## Troubleshooting Development Issues

### Web Interface Issues
- **Empty/unstyled web interface on port 6280**: Use `npm run dev:web` (port 6281) instead of `npm run dev:server:*`
- **Assets not loading**: Ensure both asset building and web server are running with `npm run dev:web`
- **Port conflicts**: Check if ports 6280/6281 are already in use with `lsof -i :6280 -i :6281`

### CLI Issues  
- **"Cannot find module" errors**: 
  - For development: Use `npx vite-node src/index.ts <command>`
  - For production: Run `npm run build` first, then `npm run cli <command>`
- **Environment variables not loaded**: Ensure `.env` file exists in project root

### Common Development Workflow
1. **First time setup**:
   ```bash
   npm install
   cp .env.example .env  # Edit with your API key
   npm run dev:web       # Start web interface
   ```

2. **Daily development**:
   ```bash
   npm run dev:web       # Web interface development
   # OR
   npm run dev:server    # MCP server development  
   ```

3. **Testing changes**:
   ```bash
   npm test              # Run tests
   npm run lint          # Check code style
   npx vite-node src/index.ts list  # Test CLI
   ```

## Common Development Tasks

### Adding a New MCP Tool
1. Create tool class in `src/tools/NewTool.ts` following existing patterns
2. Add tool to `src/mcp/tools.ts` tool registry
3. Add corresponding CLI command in `src/cli/commands/`
4. Add web route in `src/web/routes/` if needed
5. Write tests covering the tool's public API

### Adding a New Scraper Strategy
1. Create strategy in `src/scraper/strategies/NewStrategy.ts` extending `BaseScraperStrategy`
2. Register in `src/scraper/ScraperRegistry.ts`
3. Add URL pattern matching logic
4. Implement content-specific processing middleware if needed

### Adding New Embedding Provider
1. Extend `EmbeddingFactory.ts` with provider configuration
2. Add environment variable handling in `src/utils/config.ts`
3. Update documentation with configuration examples
4. Test with sample content to ensure compatibility