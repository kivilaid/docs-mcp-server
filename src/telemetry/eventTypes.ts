/**
 * Type definitions for telemetry events with required properties.
 * Each event type has a corresponding interface defining its required properties.
 */

import type { TelemetryEvent } from "./analytics";

// Base interface for all telemetry events
interface BaseTelemetryProperties {
  // Common optional properties that can be added to any event
  [key: string]: unknown;
}

// Session Events
export interface SessionStartedProperties extends BaseTelemetryProperties {
  interface: string;
  version: string;
  platform: string;
  authEnabled: boolean;
  readOnly: boolean;
  servicesCount: number;
}

export interface SessionEndedProperties extends BaseTelemetryProperties {
  durationMs: number;
  interface: string;
}

// Application Events
export interface AppStartedProperties extends BaseTelemetryProperties {
  mode: string;
  port?: number;
  services: string[];
}

export interface AppShutdownProperties extends BaseTelemetryProperties {
  durationMs: number;
  mode: string;
  graceful: boolean;
}

// Command Events
export interface CommandExecutedProperties extends BaseTelemetryProperties {
  command: string;
  success: boolean;
  durationMs: number;
  args?: Record<string, unknown>;
}

// Tool Events
export interface ToolUsedProperties extends BaseTelemetryProperties {
  tool: string;
  success: boolean;
  durationMs: number;
  [key: string]: unknown; // Allow additional tool-specific properties
}

// HTTP Events
export interface HttpRequestCompletedProperties extends BaseTelemetryProperties {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userAgent?: string;
  contentLength?: number;
}

// Pipeline Events
export interface PipelineJobProgressProperties extends BaseTelemetryProperties {
  jobId: string;
  library: string;
  pagesScraped: number;
  totalPages: number;
  totalDiscovered: number;
  progressPercent: number;
  currentDepth: number;
}

export interface PipelineJobCompletedProperties extends BaseTelemetryProperties {
  jobId: string;
  library: string;
  status: string;
  duration_ms: number | null;
  queue_wait_time_ms: number | null;
  pages_processed: number;
  max_pages_configured: number;
  has_version: boolean;
  has_error: boolean;
}

// Document Events
export interface DocumentProcessedProperties extends BaseTelemetryProperties {
  mimeType: string;
  contentSizeBytes: number;
  processingTimeMs: number;
  chunksCreated: number;
  hasTitle: boolean;
  hasDescription: boolean;
}

// Type mapping for event to properties
export interface TelemetryEventPropertiesMap {
  [TelemetryEvent.SESSION_STARTED]: SessionStartedProperties;
  [TelemetryEvent.SESSION_ENDED]: SessionEndedProperties;
  [TelemetryEvent.APP_STARTED]: AppStartedProperties;
  [TelemetryEvent.APP_SHUTDOWN]: AppShutdownProperties;
  [TelemetryEvent.COMMAND_EXECUTED]: CommandExecutedProperties;
  [TelemetryEvent.TOOL_USED]: ToolUsedProperties;
  [TelemetryEvent.HTTP_REQUEST_COMPLETED]: HttpRequestCompletedProperties;
  [TelemetryEvent.PIPELINE_JOB_PROGRESS]: PipelineJobProgressProperties;
  [TelemetryEvent.PIPELINE_JOB_COMPLETED]: PipelineJobCompletedProperties;
  [TelemetryEvent.DOCUMENT_PROCESSED]: DocumentProcessedProperties;
}
