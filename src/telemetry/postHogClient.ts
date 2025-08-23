/**
 * PostHog client wrapper for telemetry events.
 * Handles PostHog SDK integration and event capture with privacy-first configuration.
 */

import { PostHog } from "posthog-node";
import { logger } from "../utils/logger";

/**
 * PostHog client wrapper for telemetry events
 */
export class PostHogClient {
  private client?: PostHog;
  private enabled: boolean;

  // PostHog configuration - hardcoded for user tracking
  private static readonly CONFIG = {
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

  constructor(enabled: boolean) {
    this.enabled = enabled;

    if (this.enabled && PostHogClient.CONFIG.apiKey) {
      try {
        this.client = new PostHog(PostHogClient.CONFIG.apiKey, {
          host: PostHogClient.CONFIG.host,
          flushAt: PostHogClient.CONFIG.flushAt,
          flushInterval: PostHogClient.CONFIG.flushInterval,
          disableGeoip: PostHogClient.CONFIG.disableGeoip,
        });
        logger.debug("PostHog client initialized");
      } catch (error) {
        logger.debug(
          `PostHog initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        this.enabled = false;
      }
    } else {
      this.enabled = false;
      logger.debug("PostHog client disabled");
    }
  }

  /**
   * Send event to PostHog
   */
  capture(distinctId: string, event: string, properties: Record<string, unknown>): void {
    if (!this.enabled || !this.client) return;

    try {
      this.client.capture({
        distinctId,
        event,
        properties,
      });
      logger.debug(`PostHog event captured: ${event}`);
    } catch (error) {
      logger.debug(
        `PostHog capture error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Graceful shutdown with event flushing
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      try {
        await this.client.shutdown();
        logger.debug("PostHog client shutdown complete");
      } catch (error) {
        logger.debug(
          `PostHog shutdown error: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }
  }

  /**
   * Check if client is enabled and ready
   */
  isEnabled(): boolean {
    return this.enabled && !!this.client;
  }
}
