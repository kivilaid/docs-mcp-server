/**
 * Telemetry utilities for privacy-first analytics and user tracking.
 *
 * This module provides comprehensive telemetry functionality including:
 * - Analytics tracking with PostHog integration
 * - Session management for different interfaces (CLI, MCP, Web, Pipeline)
 * - Persistent user identification with database backing
 * - Data sanitization for privacy protection
 * - Configuration management with opt-out controls
 */

export type { SessionContext } from "./analytics";
// Core analytics and tracking
export { analytics, TelemetryEvent, trackTool } from "./analytics";

// Configuration and privacy
export { generateInstallationId, TelemetryConfig } from "./config";
export * from "./dataSanitizer";
export type { TelemetryInit, TelemetryInitConfig } from "./service";
// Main service
export { initializeTelemetry } from "./service";
// Session management
export * from "./sessionManager";
export type { ActivityType, UserRecord } from "./userTracking";
// User tracking
export { UserTrackingService } from "./userTracking";
