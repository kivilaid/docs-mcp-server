/**
 * Telemetry utilities for privacy-first analytics.
 *
 * This module provides comprehensive telemetry functionality including:
 * - Analytics tracking with PostHog integration and installation ID
 * - Session management for different interfaces (CLI, MCP, Web, Pipeline)
 * - Data sanitization for privacy protection
 * - Configuration management with opt-out controls
 */

// Core analytics and tracking
export { analytics, TelemetryEvent } from "./analytics";
export type * from "./eventTypes";
export type { SessionContext } from "./SessionContext";
export * from "./sanitizer";
// Session management
export * from "./sessions";
// Configuration and privacy
export {
  generateInstallationId,
  shouldEnableTelemetry,
  TelemetryConfig,
} from "./TelemetryConfig";
// Telemetry service
export type { TelemetryService } from "./TelemetryService";
export { createTelemetryService, telemetryService } from "./TelemetryService";
