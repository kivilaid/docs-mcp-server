# Pipeline Architecture

## Overview

The pipeline system manages asynchronous document processing with persistent job state and coordinated execution across embedded or external workers.

## Core Components

### PipelineFactory

Central factory that selects pipeline implementation based on configuration:

```typescript
interface PipelineOptions {
  recoverJobs?: boolean; // Enable job recovery from database
  serverUrl?: string; // External worker URL
  concurrency?: number; // Worker concurrency limit
}
```

**Selection Logic:**

- `serverUrl` specified → PipelineClient (external worker)
- `recoverJobs: true` → PipelineManager with recovery
- `recoverJobs: false` → PipelineManager without recovery

### PipelineManager

Manages job queue and worker coordination for embedded processing:

**Responsibilities:**

- Job queue management with concurrency limits
- Worker lifecycle management
- Progress tracking and status updates
- Database state synchronization
- Job recovery after restart

**Job Recovery:**

- Loads QUEUED and RUNNING jobs from database on startup
- Resets RUNNING jobs to QUEUED for re-execution
- Maintains job configuration for reproducible processing

### PipelineClient

HTTP client providing identical interface to PipelineManager for external worker communication:

**Features:**

- RESTful API client for remote job operations
- Identical method signatures to PipelineManager
- Error handling and connection management
- Health check monitoring

### PipelineWorker

Executes individual jobs with progress reporting:

**Execution Flow:**

1. Fetch job configuration from queue
2. Initialize scraper with job parameters
3. Process content through scraper pipeline
4. Update progress via callbacks
5. Store results and mark completion

## Job Lifecycle

### Job States

```
QUEUED → RUNNING → COMPLETED
              ↓
            FAILED
              ↓
           CANCELLED
```

### State Transitions

- **QUEUED**: Job created, waiting for worker
- **RUNNING**: Worker processing job
- **COMPLETED**: Successful completion
- **FAILED**: Error during processing
- **CANCELLED**: Manual cancellation

### Progress Tracking

Jobs report progress through callback mechanism:

- Pages discovered and processed
- Current processing status
- Error messages and warnings
- Estimated completion time

## Write-Through Architecture

### Single Source of Truth

PipelineJob objects contain both runtime state and database fields, ensuring consistency between memory and persistent storage.

### Immediate Persistence

All state changes immediately write to database:

- Status transitions
- Progress updates
- Error information
- Configuration changes

### Recovery Mechanism

Database state enables automatic recovery:

1. Load pending jobs on startup
2. Reset RUNNING jobs to QUEUED
3. Resume processing with original configuration
4. Maintain progress history

## Concurrency Management

### Worker Pool

PipelineManager maintains configurable worker pool:

- Default concurrency: 3 workers
- Configurable via environment or CLI
- Workers process jobs independently
- Queue coordination prevents conflicts

### Job Distribution

Jobs are distributed to available workers using:

- FIFO queue ordering
- Worker availability checking
- Load balancing across workers
- Graceful worker shutdown handling

## External Worker API

### Endpoints

- `POST /api/jobs` - Create new job
- `GET /api/jobs` - List jobs with filtering
- `GET /api/jobs/:id` - Get job details
- `DELETE /api/jobs/:id` - Cancel job
- `GET /api/health` - Health check

### Request/Response Format

Jobs use consistent JSON schema across API endpoints with embedded progress and configuration data.

### Error Handling

API provides structured error responses with status codes and detailed error messages.

## Configuration Persistence

### Job Configuration

Each job stores complete scraper configuration:

- Source URL and scraping parameters
- Library name and version information
- Processing options and filters
- Retry and timeout settings

### Reproducible Processing

Stored configuration enables:

- Exact re-indexing with same parameters
- Configuration auditing and debugging
- Version-specific processing rules
- Consistent results across runs

## Monitoring and Observability

### Progress Reporting

Real-time progress updates through:

- Callback-based progress notifications
- Database persistence of progress state
- Web UI polling for status display
- Log-based progress tracking

### Error Tracking

Comprehensive error information:

- Exception stack traces
- Processing context at failure
- Retry attempt logging
- User-friendly error messages

### Performance Metrics

Job execution metrics:

- Processing duration
- Pages processed per minute
- Memory and resource usage
- Queue depth and throughput

## Scaling Patterns

### Vertical Scaling

Increase worker concurrency within single process:

- Higher concurrency limits
- More memory allocation
- Faster storage backend

### Horizontal Scaling

Distribute workers across processes:

- External worker deployment
- Load balancer coordination
- Independent worker scaling
- Database connection pooling

### Hybrid Deployment

Combine embedded and external workers:

- Coordinator with embedded workers
- Additional external workers for peak load
- Flexible resource allocation
- Cost-optimized scaling
