/**
 * Simplified telemetry service that provides a clean interface to analytics.
 * No more async initialization or user tracking complexity.
 */

import type { SessionContext } from "./analytics";
import { analytics } from "./analytics";

/**
 * Simple telemetry service interface
 */
export interface TelemetryService {
  startSession: (context: SessionContext) => void;
  endSession: () => void;
  shutdown: () => Promise<void>;
}

/**
 * Create a simple telemetry service instance.
 * No async initialization needed - analytics is ready to use immediately.
 */
export function createTelemetryService(): TelemetryService {
  return {
    startSession: (context: SessionContext) => {
      analytics.startSession(context);
    },

    endSession: () => {
      analytics.endSession();
    },

    shutdown: async () => {
      await analytics.shutdown();
    },
  };
}

/**
 * Global telemetry service instance
 */
export const telemetryService = createTelemetryService();
