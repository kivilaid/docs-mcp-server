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

  // PostHog configuration
  private static readonly CONFIG = {
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

    // Check if API key was injected at build time
    if (!__POSTHOG_API_KEY__) {
      logger.debug("PostHog API key not provided - analytics disabled");
      this.enabled = false;
      return;
    }

    if (this.enabled) {
      try {
        this.client = new PostHog(__POSTHOG_API_KEY__, {
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
   * Capture exception using PostHog's native error tracking
   */
  captureException(
    distinctId: string,
    error: Error,
    properties?: Record<string, unknown>,
  ): void {
    if (!this.enabled || !this.client) return;

    try {
      this.client.captureException({
        error,
        distinctId,
        properties: {
          ...(properties || {}),
        },
      });
      logger.debug(`PostHog exception captured: ${error.constructor.name}`);
    } catch (captureError) {
      logger.debug(
        `PostHog captureException error: ${captureError instanceof Error ? captureError.message : "Unknown error"}`,
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
