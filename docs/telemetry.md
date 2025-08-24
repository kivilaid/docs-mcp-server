# Telemetry Architecture

The MCP Documentation Server implements privacy-first telemetry to understand usage patterns, monitor performance, and improve user experience. The system is designed with user privacy as the primary concern while providing valuable insights for product development.

## Core Principles

### Privacy First

- **No Sensitive Data**: Never collects URLs, document content, search queries, or authentication tokens
- **Metadata Only**: Tracks counts, durations, success/failure states, and performance metrics
- **Data Sanitization**: Built-in utilities ensure no personally identifiable information is collected
- **User Control**: Simple opt-out mechanisms via CLI flags and environment variables

### Minimal Performance Impact

- **Synchronous Design**: Simple, lightweight telemetry with minimal overhead
- **Graceful Degradation**: System continues functioning normally when telemetry fails
- **No Dependencies**: Core application never depends on telemetry functionality
- **Installation ID Only**: Uses persistent UUID for consistent analytics without user tracking

### Simple Architecture

- **Direct Analytics**: Direct PostHog integration with installation ID as distinct user
- **Focused Data Collection**: Essential functions only, no over-engineering
- **Easy Integration**: Simple service interface for application components

## System Architecture

### Core Components

The telemetry system consists of four main components:

**Analytics Layer** (`src/telemetry/analytics.ts`)

- PostHog integration with privacy-optimized configuration
- Event tracking with automatic session context inclusion
- Installation ID as the distinct user identifier
- Session lifecycle management for different interface types

**PostHog Client** (`src/telemetry/postHogClient.ts`)

- Automatic camelCase to snake_case property conversion for PostHog compatibility
- Privacy-optimized PostHog configuration
- Error tracking with native PostHog exception capture

**Configuration Management** (`src/telemetry/config.ts`)

- Installation ID generation and persistence using UUID
- Telemetry enable/disable controls via environment variables and CLI flags
- Configuration validation and fallback handling

**Service Layer** (`src/telemetry/service.ts`)

- Simple service factory providing session management
- Unified interface for application components
- Handles configuration and analytics integration

**Data Sanitization** (`src/telemetry/dataSanitizer.ts`)

- Essential privacy protection functions:
  - Domain extraction without exposing paths
  - Protocol detection for file and web URLs
  - Error message sanitization removing sensitive information
  - Search query analysis without storing content
  - CLI flag extraction for usage patterns
- User agent categorization for browser analytics
- Content size categorization for processing insights

### Session Management

The session management system provides context for analytics events across different interfaces:

**Session Factory Functions** (`src/telemetry/sessionManager.ts`)

- `createCliSession()`: Creates context for command-line interface usage
- `createMcpSession()`: Creates context for MCP protocol sessions
- `createWebSession()`: Creates context for web interface requests
- `createPipelineSession()`: Creates context for background processing jobs

**Session Context**

Each session includes:

- Session ID: UUID generated per session
- Interface type and configuration
- Platform information (OS, Node.js version)
- Session start time and metadata
- Application version and enabled services

Properties use consistent naming conventions with domain-specific prefixes:

- `app*` properties: Application-level context (appVersion, appInterface, appPlatform)
- `mcp*` properties: MCP protocol-specific context (mcpProtocol, mcpTransport)
- `web*` properties: Web interface context (webRoute)
- `cli*` properties: Command-line interface context (cliCommand)
- `ai*` properties: AI/embedding model context (aiEmbeddingProvider, aiEmbeddingModel)

### Installation ID System

The system uses a persistent installation identifier for consistent analytics:

**Installation ID Generation** (`src/telemetry/config.ts`)

- Creates UUID-based installation identifier stored in `installation.id`
- Uses `envPaths` standard for cross-platform directory location (`~/.local/share/docs-mcp-server/`)
- Supports `DOCS_MCP_STORE_PATH` environment variable override for Docker deployments
- Provides consistent identification across sessions without user tracking
- Falls back to new UUID generation if file is corrupted or missing

## Integration Points

### Application Server Integration

The AppServer integrates telemetry for application lifecycle tracking:

**Startup Tracking**

- Application configuration and enabled services
- Session initialization based on interface type
- Installation ID verification and service availability

**Configuration Integration**

- Respects telemetry configuration settings
- Integrates with environment variables (`DOCS_MCP_TELEMETRY=false`) and CLI flags (`--no-telemetry`)
- Provides graceful fallback when telemetry is disabled

**Service Integration**

- Simple telemetry service initialization
- Session context creation for analytics
- Event tracking with sanitized data

### Service-Level Integration

Services integrate telemetry through the simplified service interface:

**Web Service** (`src/services/webService.ts`)

- Basic request tracking and performance metrics
- Error tracking with sanitized error information
- Session management for web interface users

**Worker Service** (`src/services/workerService.ts`)

- Pipeline job progress and completion tracking
- Error tracking with sanitized job information
- Performance metrics for background processing

**MCP Service** (`src/services/mcpService.ts`)

- Protocol session lifecycle tracking
- Basic usage analytics and error tracking

## Data Collection Patterns

### Event Types

The system tracks essential event types for usage understanding:

- `session_started` / `session_ended`: Session lifecycle tracking
- `tool_used`: Individual tool execution and outcomes
- `job_completed` / `job_failed`: Background processing results
- **Error Tracking**: PostHog's native exception tracking with full stack traces and context

### Session Context

All events automatically include basic session context:

- Interface type (CLI, MCP, Web, Pipeline)
- Application version and platform information
- Session ID and installation ID
- Basic timing information

Property names follow PostHog's snake_case convention through automatic conversion from internal camelCase names.

### Privacy-Safe Data Collection

The system ensures privacy through essential data sanitization:

**URL and Path Sanitization**

- Hostname extraction without paths or parameters (`extractHostname`)
- Protocol identification for file and web URLs (`extractProtocol`)
- Error message sanitization removing sensitive paths and tokens (`sanitizeErrorMessage`)

**Error Information**

- **Native Error Tracking**: PostHog's exception capture with full stack traces and automatic grouping
- Error sanitization functions available for sensitive contexts (`sanitizeError`, `sanitizeErrorMessage`)
- Component identification and contextual information
- Enhanced debugging capabilities with source code integration

**Usage Patterns**

- CLI flag extraction without values (`extractCliFlags`)
- Search query analysis without storing content (`analyzeSearchQuery`)
- Basic performance metrics without sensitive data

## Configuration and Control

### User Control Mechanisms

**CLI Flags**

- `--no-telemetry`: Disable all telemetry for current session

**Environment Variables**

- `DOCS_MCP_TELEMETRY=false`: Global disable telemetry collection
- `DOCS_MCP_STORE_PATH=/custom/path`: Override installation ID storage location (useful for Docker volumes)

**Configuration Integration**

- Simple enable/disable configuration
- Graceful fallback when disabled
- No impact on core functionality when opted out

**Runtime Behavior**

- Telemetry failures never affect application functionality
- Simple fallback to no-op behavior when disabled
- Installation ID persisted locally in standard user data directory

### Development and Testing

**Development Mode**

- Environment-based configuration for development vs production
- Enhanced logging for telemetry debugging when needed

**Testing**

- Comprehensive test coverage for all telemetry functions
- Privacy validation in data sanitization tests
- Behavior-focused testing without timing dependencies

## Analytics and Insights

### Usage Analytics

The simplified telemetry system provides essential insights:

- Tool usage patterns across different interfaces
- Session frequency and basic engagement metrics
- Error patterns and system reliability
- Feature adoption trends

### Performance Monitoring

Key performance insights include:

- Error rates and common failure patterns
- Basic processing performance metrics
- System stability and reliability trends

### Product Intelligence

Strategic insights for product development:

- Interface preference trends (CLI vs MCP vs Web)
- Tool popularity and usage patterns
- Error categorization for improvement priorities

## Privacy Compliance

### Data Minimization

The system implements strict data minimization:

- Only essential data collection for core insights
- Installation ID as the only persistent identifier
- No user tracking or cross-session correlation beyond installation
- Minimal data retention with focus on current patterns

### Transparency

Users have clear control and visibility:

- Simple opt-out mechanisms
- Clear documentation of collected data types
- No hidden or complex data collection
- Installation ID stored locally and under user control

### Security

Telemetry data protection:

- Encrypted transmission to analytics service
- No sensitive local storage beyond installation ID
- Simple UUID-based identification system
- Essential data sanitization to prevent information leakage

The simplified telemetry architecture provides essential insights while maintaining user privacy and system simplicity, enabling focused product development without complex tracking systems.
