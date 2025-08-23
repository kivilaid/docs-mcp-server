/**
 * Main telemetry service that combines analytics, user tracking, and session management.
 * Provides a unified interface for initializing and managing telemetry across the application.
 */

import fs from "node:fs";
import path from "node:path";
import envPaths from "env-paths";
import { logger } from "../utils/logger";
import { getProjectRoot } from "../utils/paths";
import type { SessionContext } from "./analytics";
import { analytics } from "./analytics";
import type { ActivityType, UserTrackingService } from "./userTracking";

/**
 * Configuration for telemetry initialization
 */
export interface TelemetryInitConfig {
  enablePersistentTracking?: boolean;
  dbPath?: string;
}

/**
 * Result of telemetry initialization
 */
export interface TelemetryInit {
  userTrackingService?: UserTrackingService;
  trackUserActivity: (activityType: ActivityType) => Promise<void>;
  startSession: (context: SessionContext) => Promise<void>;
  endSession: () => Promise<void>;
  shutdown: () => Promise<void>;
}

/**
 * Initialize enhanced telemetry with persistent user tracking
 */
export async function initializeTelemetry(
  config: TelemetryInitConfig = {},
): Promise<TelemetryInit> {
  // Default to enabling persistent tracking
  const { enablePersistentTracking = true } = config;

  if (!enablePersistentTracking || !analytics.isEnabled()) {
    // Return no-op functions if telemetry is disabled
    return {
      trackUserActivity: async () => {}, // No-op
      startSession: async () => {}, // No-op
      endSession: async () => {}, // No-op
      shutdown: async () => {}, // No-op
    };
  }

  try {
    // Determine database path
    const dbPath = config.dbPath || getDatabasePath();

    // Import UserTrackingService dynamically to avoid circular dependencies
    const { UserTrackingService } = await import("./userTracking");

    // Create user tracking service
    const userTrackingService = new UserTrackingService(dbPath);

    // Get or create persistent user UUID
    const persistentUserId = await userTrackingService.getOrCreateUser();

    // Set the persistent user ID in analytics
    analytics.setUserId(persistentUserId);

    logger.debug(
      `Telemetry initialized with persistent user tracking: ${persistentUserId}`,
    );

    // Return service and helper functions
    return {
      userTrackingService,

      trackUserActivity: async (activityType: ActivityType) => {
        try {
          await userTrackingService.trackUserActivity(persistentUserId, activityType);
        } catch (error) {
          logger.debug(
            `Failed to track user activity: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },

      startSession: async (context: SessionContext) => {
        analytics.startSession(context);
        // Track session start
        try {
          await userTrackingService.trackUserActivity(persistentUserId, "session");
        } catch (error) {
          logger.debug(
            `Failed to track session start: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },

      endSession: async () => {
        analytics.endSession();
      },

      shutdown: async () => {
        try {
          await analytics.shutdown();
          userTrackingService.close();
          logger.debug("Telemetry shutdown complete");
        } catch (error) {
          logger.debug(
            `Telemetry shutdown error: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },
    };
  } catch (error) {
    logger.debug(
      `Failed to initialize persistent user tracking: ${error instanceof Error ? error.message : "Unknown error"}`,
    );

    // Fall back to basic analytics without persistent tracking
    return {
      trackUserActivity: async () => {}, // No-op fallback
      startSession: async (context: SessionContext) => {
        analytics.startSession(context);
      },
      endSession: async () => {
        analytics.endSession();
      },
      shutdown: async () => {
        await analytics.shutdown();
      },
    };
  }
}

/**
 * Get the database path for user tracking, using the same logic as DocumentManagementService
 */
function getDatabasePath(): string {
  // 1. Check Environment Variable
  const envStorePath = process.env.DOCS_MCP_STORE_PATH;
  if (envStorePath) {
    return path.join(envStorePath, "documents.db");
  }

  // 2. Check Old Local Path
  const projectRoot = getProjectRoot();
  const oldDbPath = path.join(projectRoot, ".store", "documents.db");

  if (fs.existsSync(oldDbPath)) {
    return oldDbPath;
  }

  // 3. Use Standard Path
  const standardPaths = envPaths("docs-mcp-server", { suffix: "" });
  return path.join(standardPaths.data, "documents.db");
}
