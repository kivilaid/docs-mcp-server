/**
 * Telemetry utilities for privacy-first analytics.
 *
 * This module provides comprehensive telemetry functionality including:
 * - Analytics tracking with PostHog integration and installation ID
 * - Session management for different interfaces (CLI, MCP, Web, Pipeline)
 * - Data sanitization for privacy protection
 * - Configuration management with opt-out controls
 */

export type { SessionContext } from "./analytics";
// Core analytics and tracking
export { analytics, TelemetryEvent, trackTool } from "./analytics";

// Configuration and privacy
export { generateInstallationId, shouldEnableTelemetry, TelemetryConfig } from "./config";
export * from "./dataSanitizer";

// Simplified telemetry service
export type { TelemetryService } from "./service";
export { createTelemetryService, telemetryService } from "./service";

// Session management
export * from "./sessionManager";
