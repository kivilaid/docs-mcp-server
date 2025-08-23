# Telemetry Architecture

The MCP Documentation Server implements comprehensive privacy-first telemetry to understand usage patterns, monitor performance, and improve user experience. The system is designed with user privacy as the primary concern while providing valuable insights for product development.

## Core Principles

### Privacy First

- **No Sensitive Data**: Never collects URLs, document content, search queries, or authentication tokens
- **Metadata Only**: Tracks counts, durations, success/failure states, and performance metrics
- **Data Sanitization**: Built-in utilities ensure no personally identifiable information is collected
- **User Control**: Simple opt-out mechanisms via CLI flags and environment variables

### Minimal Performance Impact

- **Asynchronous Tracking**: All telemetry operations are non-blocking
- **Graceful Degradation**: System continues functioning normally when telemetry fails
- **Efficient Batching**: Events are batched and sent efficiently to minimize network overhead
- **Memory-Only Persistence**: No local telemetry data storage for privacy

### Modular Architecture

- **Service-Based Design**: Clean separation between analytics, user tracking, and session management
- **Interface Abstraction**: Easy to swap analytics backends without code changes
- **Optional Integration**: Components can easily enable or disable tracking as needed

## System Architecture

### Analytics Foundation

The telemetry system is built on three core layers:

**Analytics Layer** (`src/telemetry/analytics.ts`)

- PostHog integration with privacy-optimized configuration
- Event tracking with automatic session context inclusion
- Batch processing and error resilience
- Session lifecycle management for different interface types

**Service Layer** (`src/telemetry/service.ts`)

- High-level initialization and coordination
- Combines analytics, user tracking, and session management
- Provides unified interface for application components
- Handles fallback scenarios when components are unavailable

**Data Sanitization** (`src/telemetry/dataSanitizer.ts`)

- URL and domain extraction without exposing paths
- Error categorization and message sanitization
- User agent categorization for browser analytics
- Content size categorization for processing insights

### Session Management

The system recognizes four distinct session types, each with specific lifecycle and context requirements:

**CLI Sessions**

- Lifecycle: Command invocation → execution → completion
- Context: Command name, execution duration, success/failure
- Session ID: UUID generated per command execution

**MCP Protocol Sessions**

- Lifecycle: Service registration → transport connection → disconnection
- Context: Protocol type (stdio/http), transport mode, read-only state
- Session ID: Transport session ID or server instance ID

**Web Request Sessions**

- Lifecycle: HTTP request → response
- Context: Route accessed, response time, status codes
- Session ID: Request-scoped UUID

**Pipeline Job Sessions**

- Lifecycle: Job creation → processing → completion/failure
- Context: Library, job type, pages processed, error types
- Session ID: Pipeline job ID

### Persistent User Tracking

The system implements database-backed user identification for consistent cross-session tracking:

**Database Schema** (Migration 009)

- `user_tracking` table stores anonymous UUIDs and activity counters
- Indexed by UUID, last seen timestamp, and installation ID
- Tracks total sessions, commands, and documents processed

**UserTrackingService** (`src/telemetry/userTracking.ts`)

- Generates and maintains persistent anonymous user identifiers
- Falls back to installation-based identification when needed
- Tracks user activity patterns without personal information
- Provides cross-session user journey insights

**Installation ID Generation**

- Creates anonymous identifiers based on system characteristics
- Uses CPU count, memory, and platform information
- Provides fallback identification when database is unavailable

## Integration Points

### Application Server Integration

The AppServer uses the enhanced telemetry service for comprehensive application lifecycle tracking:

**Startup Tracking**

- Application configuration and enabled services
- Startup duration and success/failure states
- Environment detection and system characteristics

**Configuration Respect**

- Honors `config.telemetry` setting for enable/disable control
- Integrates with environment variables and CLI flags
- Provides graceful fallback when telemetry is disabled

**Session Management**

- Initializes session context based on interface type
- Tracks user activity and session duration
- Handles proper cleanup and shutdown procedures

### Service-Level Integration

Each service integrates telemetry appropriate to its function and user interactions:

**Web Service** (`src/services/webService.ts`)

- Request/response middleware tracking
- Performance metrics for HTTP requests
- User agent categorization for browser insights
- Route-level usage analytics

**MCP Service** (`src/services/mcpService.ts`)

- Protocol session lifecycle tracking
- Transport mode and configuration analytics
- Connection duration and stability metrics

**Worker Service** (`src/services/workerService.ts`)

- Pipeline job progress and completion tracking
- Processing performance and error analytics
- Queue health and throughput metrics

### Document Processing Analytics

The document management system provides comprehensive insights into content processing:

**Processing Metrics**

- Document size categorization and processing time
- Chunk creation efficiency and distribution
- Content type analysis and processing patterns
- Success/failure rates with error categorization

**Performance Tracking**

- Processing speed in KB/second
- Average chunk sizes and ratios
- Memory usage and resource efficiency
- Bottleneck identification and optimization insights

**Privacy-Safe Content Analysis**

- MIME type and domain extraction without URLs
- Content size patterns without actual content
- Processing patterns without sensitive metadata

### Error Tracking and Categorization

The system implements comprehensive error tracking while maintaining privacy:

**Error Categories**

- Network: Connection and fetch-related failures
- Parsing: Content processing and format errors
- Authentication: Permission and access issues
- Timeout: Performance and resource limitations
- Database: Storage and retrieval failures

**Error Context**

- Component identification and error frequency
- Recoverable vs non-recoverable error classification
- Error patterns and correlation analysis
- Performance impact assessment

## Data Collection Patterns

### Event Types

The system tracks a focused set of event types to maintain data clarity:

- `session_started` / `session_ended`: Session lifecycle tracking
- `app_started` / `app_shutdown`: Application lifecycle events
- `tool_used`: Individual tool execution and outcomes
- `http_request_completed`: Web request performance and patterns
- `pipeline_job_progress` / `pipeline_job_completed`: Background processing
- `document_processed` / `document_processing_failed`: Content processing
- `error_occurred`: System errors and recovery patterns

### Session Context

All events automatically include session-specific context:

- Interface type and configuration
- Application version and platform information
- Enabled services and security settings
- Session duration and activity patterns

### Privacy-Safe Data Collection

The system ensures privacy through multiple layers of protection:

**URL Sanitization**

- Domain extraction without paths or parameters
- Protocol identification without sensitive information
- Route patterns without actual URLs or user input

**Content Analysis**

- Size and type categorization without content
- Processing patterns without sensitive metadata
- Performance metrics without exposing data

**User Identification**

- Anonymous UUIDs with no personal correlation
- System-based identification without user data
- Cross-session tracking without identity exposure

## Configuration and Control

### User Control Mechanisms

**CLI Flags**

- `--no-telemetry`: Disable all telemetry for current session
- Environment variable `DOCS_MCP_TELEMETRY=false`: Global disable

**Configuration Integration**

- AppServer `telemetry` configuration field
- Graceful fallback when disabled
- No impact on core functionality when opted out

**Runtime Behavior**

- Telemetry failures never affect application functionality
- Automatic fallback to no-op implementations when disabled
- Memory-only operation with no persistent tracking data

### Development and Testing

**Development Mode**

- Separate PostHog project for development data
- Enhanced logging for telemetry debugging
- Local testing without affecting production analytics

**Testing Isolation**

- Memory-only persistence prevents test data pollution
- Mock implementations for unit testing
- Privacy validation in sanitization tests

## Analytics and Insights

### Usage Analytics

The telemetry system provides insights into:

- Tool popularity across different interfaces
- User workflow patterns and tool combinations
- Session duration and engagement metrics
- Feature adoption and usage trends

### Performance Monitoring

Key performance insights include:

- Processing speed trends and bottlenecks
- Error rates and recovery patterns
- Resource usage and efficiency metrics
- Network performance and reliability

### Product Intelligence

Strategic insights for product development:

- Interface preference trends (CLI vs MCP vs Web)
- Content type popularity and processing patterns
- Library and documentation source preferences
- User journey analysis and workflow optimization

## Privacy Compliance

### Data Minimization

The system implements strict data minimization principles:

- Only collect data necessary for specific insights
- Aggregate and anonymize data wherever possible
- Automatically expire sensitive temporary data
- Minimize data retention periods

### Transparency

Users have clear visibility into data collection:

- Documentation of all collected data types
- Clear explanation of privacy protections
- Simple opt-out mechanisms
- No hidden or undocumented data collection

### Security

Telemetry data is protected through:

- Encrypted transmission to analytics service
- No local storage of sensitive information
- Anonymous identification systems
- Regular privacy compliance audits

The telemetry architecture provides comprehensive insights while maintaining strict privacy protections, enabling data-driven product development without compromising user trust or application performance.
