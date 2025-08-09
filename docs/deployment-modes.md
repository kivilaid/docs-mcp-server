# Deployment Modes

## Overview

The system supports two deployment patterns with automatic protocol detection for seamless integration with different environments.

## Standalone Server Mode

Single process containing all services on one port (default: 6280). This mode combines:

- MCP server accessible via `/mcp` and `/sse` endpoints
- Web interface for job management
- Embedded worker for document processing
- Pipeline RPC (tRPC over HTTP) for programmatic access

### Use Cases

- Development environments
- Single-container deployments
- Simple production setups
- Local documentation indexing

### Service Configuration

Services can be selectively enabled via AppServerConfig:

- `enableMcpServer`: MCP protocol endpoint
- `enableWebInterface`: Web UI and management API
- `enableWorker`: Embedded job processing
- `enablePipelineApi`: HTTP API for job operations

## Distributed Mode

Separate coordinator and worker processes for scaling. The coordinator handles interfaces while workers process jobs.

### Architecture

- **Coordinator**: Runs MCP server, web interface, and Pipeline RPC
- **Workers**: Execute document processing jobs
- **Communication**: Coordinator uses Pipeline RPC (tRPC over HTTP) to talk to workers

### Use Cases

- High-volume processing
- Container orchestration (Kubernetes, Docker Swarm)
- Horizontal scaling requirements
- Resource isolation

### Worker Management

Workers may expose a simple `/health` or container-level healthcheck for monitoring. Coordinators communicate with workers via Pipeline RPC.

## Protocol Auto-Detection

The system automatically selects communication protocol based on execution environment:

### Detection Logic

```
if (!process.stdin.isTTY && !process.stdout.isTTY) {
  return "stdio";  // AI tools, CI/CD
} else {
  return "http";   // Interactive terminals
}
```

### Stdio Mode

- Direct MCP communication via stdin/stdout
- Used by VS Code, Claude Desktop, other AI tools
- No HTTP server required
- Minimal resource usage

### HTTP Mode

- Server-Sent Events transport for MCP
- Full web interface available
- Pipeline RPC accessible at `/trpc`
- Suitable for browser access

### Manual Override

Protocol can be explicitly set via `--protocol stdio|http` flag, bypassing auto-detection.

## Configuration

### Environment Variables

- `DOCS_MCP_EMBEDDING_MODEL`: Embedding provider configuration

### CLI Arguments

- `--protocol auto|stdio|http`: Protocol selection
- `--port <number>`: HTTP server port
- `--server-url <url>`: External worker URL for distributed mode
- `--resume`: Enable job recovery on startup

## Job Recovery

Job recovery behavior depends on deployment mode:

### Standalone Server

- Embedded worker recovers pending jobs from database
- Enabled by default for persistent job processing
- Prevents job loss during server restarts

### Distributed Mode

- Workers handle their own job recovery
- Coordinators do not recover jobs to avoid conflicts
- Each worker maintains independent job state

### CLI Commands

- No job recovery to prevent conflicts
- Immediate execution model
- Safe for concurrent CLI usage

## Container Deployment

### Single Container

```dockerfile
FROM ghcr.io/arabold/docs-mcp-server:latest
EXPOSE 6280
CMD ["--protocol", "http", "--port", "6280"]
```

### Multi-Container (Docker Compose)

```yaml
services:
  coordinator:
    image: ghcr.io/arabold/docs-mcp-server:latest
    ports: ["6280:6280"]
  command: ["mcp", "--server-url", "http://worker:8080/trpc"]

  worker:
    image: ghcr.io/arabold/docs-mcp-server:latest
    ports: ["8080:8080"]
    command: ["worker", "--port", "8080"]
```

## Load Balancing

### Multiple Workers

Coordinators can balance load across multiple workers by configuring multiple server URLs or using a load balancer.

### Health Checks

Expose a lightweight `/health` endpoint or container healthcheck for load balancers and monitoring.

### Scaling Strategies

- Horizontal: Add more worker containers
- Vertical: Increase worker resource allocation
- Hybrid: Combine both strategies based on workload
