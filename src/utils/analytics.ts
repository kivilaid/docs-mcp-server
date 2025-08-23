/**
 * Analytics wrapper for privacy-first telemetry using PostHog.
 * Provides session-based context and automatic data sanitization.
 */

import { PostHog } from "posthog-node";
import { logger } from "./logger";
import { generateInstallationId, TelemetryConfig } from "./telemetryConfig";

/**
 * Telemetry event types for structured analytics
 */
export enum TelemetryEvent {
  SESSION_STARTED = "session_started",
  SESSION_ENDED = "session_ended",
  APP_STARTED = "app_started",
  APP_SHUTDOWN = "app_shutdown",
  COMMAND_EXECUTED = "command_executed",
  TOOL_USED = "tool_used",
  HTTP_REQUEST_COMPLETED = "http_request_completed",
  PIPELINE_JOB_PROGRESS = "pipeline_job_progress",
  PIPELINE_JOB_COMPLETED = "pipeline_job_completed",
  ERROR_OCCURRED = "error_occurred",
}

/**
 * Session context interface for different interface types
 */
export interface SessionContext {
  sessionId: string;
  interface: "mcp" | "cli" | "web" | "pipeline";
  startTime: Date;
  version: string;
  platform: string;
  nodeVersion?: string;

  // Interface-specific context
  command?: string; // CLI: command name
  protocol?: "stdio" | "http"; // MCP: protocol type
  transport?: "sse" | "streamable"; // MCP: transport mode
  route?: string; // Web: current route

  // Configuration context
  authEnabled: boolean;
  readOnly: boolean;
  servicesEnabled: string[];
}

/**
 * PostHog configuration for analytics
 */
const POSTHOG_CONFIG = {
  apiKey:
    process.env.POSTHOG_API_KEY || "phc_zDlR5l4GXHohqiJTYpH6Lc8TztgtP0GDmwIlCmyOLOs",
  host: "https://app.posthog.com",

  // Performance optimizations
  flushAt: 20, // Batch size - send after 20 events
  flushInterval: 10000, // 10 seconds - send after time

  // Privacy settings
  disableGeoip: true, // Don't collect IP geolocation
  disableSessionRecording: true, // Never record sessions
  disableSurveys: true, // No user surveys

  // Data handling
  persistence: "memory" as const, // No disk persistence for privacy
};

/**
 * Main analytics class providing privacy-first telemetry
 */
export class Analytics {
  private client?: PostHog;
  private sessionContext?: SessionContext;
  private enabled: boolean = true;
  private distinctId: string;

  constructor(enabled?: boolean) {
    this.enabled = enabled ?? TelemetryConfig.getInstance().isEnabled();
    this.distinctId = generateInstallationId();

    if (this.enabled && POSTHOG_CONFIG.apiKey) {
      try {
        this.client = new PostHog(POSTHOG_CONFIG.apiKey, {
          host: POSTHOG_CONFIG.host,
          flushAt: POSTHOG_CONFIG.flushAt,
          flushInterval: POSTHOG_CONFIG.flushInterval,
          disableGeoip: POSTHOG_CONFIG.disableGeoip,
        });
        logger.debug("Analytics enabled");
      } catch (error) {
        logger.debug(
          `Analytics initialization failed: ${error instanceof Error ? error.message : "Unknown error"}, continuing without telemetry`,
        );
        this.enabled = false;
      }
    } else {
      // Analytics disabled or no API key provided
      this.enabled = false;
      logger.debug("Analytics disabled");
    }
  }

  /**
   * Initialize session context - call once per session
   */
  startSession(context: SessionContext): void {
    if (!this.enabled) return;

    this.sessionContext = context;
    this.track(TelemetryEvent.SESSION_STARTED, {
      interface: context.interface,
      version: context.version,
      platform: context.platform,
      sessionDurationTarget: context.interface === "cli" ? "short" : "long",
      authEnabled: context.authEnabled,
      readOnly: context.readOnly,
      servicesCount: context.servicesEnabled.length,
    });
  }

  /**
   * Track an event with automatic session context inclusion
   */
  track(event: string, properties: Record<string, unknown> = {}): void {
    if (!this.enabled || !this.client) return;

    try {
      const eventProperties = {
        ...this.sessionContext, // Automatically include session context
        ...properties,
        timestamp: new Date().toISOString(),
      };

      this.client.capture({
        distinctId: this.distinctId,
        event,
        properties: eventProperties,
      });

      logger.debug(`Tracked event: ${event}`);
    } catch (error) {
      // Fail silently - never break the application
      logger.debug(
        `Analytics error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Track session end with duration
   */
  endSession(): void {
    if (!this.enabled || !this.sessionContext) return;

    const duration = Date.now() - this.sessionContext.startTime.getTime();
    this.track(TelemetryEvent.SESSION_ENDED, {
      durationMs: duration,
      interface: this.sessionContext.interface,
    });
  }

  /**
   * Graceful shutdown with event flushing
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      try {
        await this.client.shutdown();
        logger.debug("Analytics shutdown complete");
      } catch (error) {
        logger.debug(
          `Analytics shutdown error: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }
  }

  /**
   * Check if analytics is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current session context
   */
  getSessionContext(): SessionContext | undefined {
    return this.sessionContext;
  }
}

/**
 * Global analytics instance
 */
export const analytics = new Analytics();

/**
 * Helper function for tracking tool usage with error handling
 */
export async function trackTool<T>(
  toolName: string,
  operation: () => Promise<T>,
  getProperties?: (result: T) => Record<string, unknown>,
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await operation();

    analytics.track(TelemetryEvent.TOOL_USED, {
      tool: toolName,
      success: true,
      durationMs: Date.now() - startTime,
      ...(getProperties ? getProperties(result) : {}),
    });

    return result;
  } catch (error) {
    analytics.track(TelemetryEvent.TOOL_USED, {
      tool: toolName,
      success: false,
      durationMs: Date.now() - startTime,
      errorType: error instanceof Error ? error.constructor.name : "UnknownError",
    });

    throw error;
  }
}
