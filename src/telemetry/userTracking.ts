/**
 * User tracking service for persistent telemetry identification.
 * Manages database-backed persistent user UUIDs that survive system changes and migrations.
 */

import { randomUUID } from "node:crypto";
import { platform } from "node:os";
import Database from "better-sqlite3";
import { logger } from "../utils/logger";
import { generateInstallationId } from "./config";

export interface UserRecord {
  id: number;
  userUuid: string;
  createdAt: string;
  lastSeenAt: string;
  platform: string | null;
  nodeVersion: string | null;
  installationId: string | null;
  totalSessions: number;
  totalCommands: number;
  totalDocumentsProcessed: number;
}

export type ActivityType = "session" | "command" | "document";

/**
 * Service for managing persistent user identification across sessions
 */
export class UserTrackingService {
  private db: Database.Database;
  private getOrCreateUserStmt: Database.Statement;
  private updateLastSeenStmt: Database.Statement;
  private updateSessionsStmt: Database.Statement;
  private updateCommandsStmt: Database.Statement;
  private updateDocumentsStmt: Database.Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);

    // Initialize prepared statements
    this.getOrCreateUserStmt = this.db.prepare(`
      SELECT user_uuid, created_at, last_seen_at, platform, node_version, installation_id,
             total_sessions, total_commands, total_documents_processed
      FROM user_tracking 
      WHERE installation_id = ?
      LIMIT 1
    `);

    this.updateLastSeenStmt = this.db.prepare(`
      UPDATE user_tracking 
      SET last_seen_at = CURRENT_TIMESTAMP 
      WHERE user_uuid = ?
    `);

    this.updateSessionsStmt = this.db.prepare(`
      UPDATE user_tracking 
      SET total_sessions = total_sessions + 1, last_seen_at = CURRENT_TIMESTAMP 
      WHERE user_uuid = ?
    `);

    this.updateCommandsStmt = this.db.prepare(`
      UPDATE user_tracking 
      SET total_commands = total_commands + 1, last_seen_at = CURRENT_TIMESTAMP 
      WHERE user_uuid = ?
    `);

    this.updateDocumentsStmt = this.db.prepare(`
      UPDATE user_tracking 
      SET total_documents_processed = total_documents_processed + 1, last_seen_at = CURRENT_TIMESTAMP 
      WHERE user_uuid = ?
    `);
  }

  /**
   * Get or create a persistent user UUID.
   * First tries to find existing user by installation ID, then creates new if not found.
   */
  async getOrCreateUser(): Promise<string> {
    try {
      const installationId = generateInstallationId();

      // Try to find existing user by installation ID first
      const user = this.getOrCreateUserStmt.get(installationId) as UserRecord | undefined;

      if (!user) {
        // Create new user with persistent UUID
        const userUuid = randomUUID();

        const insertStmt = this.db.prepare(`
          INSERT INTO user_tracking (user_uuid, platform, node_version, installation_id)
          VALUES (?, ?, ?, ?)
        `);

        insertStmt.run(userUuid, platform(), process.version, installationId);
        logger.debug(`Created new user tracking record: ${userUuid}`);

        return userUuid;
      } else {
        logger.debug(`Found existing user: ${user.userUuid}`);

        // Update last seen timestamp
        this.updateLastSeenStmt.run(user.userUuid);
        return user.userUuid;
      }
    } catch (error) {
      // If any database error occurs, fall back to installation ID
      logger.debug(
        `User tracking failed, using installation ID: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return generateInstallationId();
    }
  }

  /**
   * Track user activity by incrementing appropriate counters
   */
  async trackUserActivity(userUuid: string, activityType: ActivityType): Promise<void> {
    try {
      switch (activityType) {
        case "session":
          this.updateSessionsStmt.run(userUuid);
          break;
        case "command":
          this.updateCommandsStmt.run(userUuid);
          break;
        case "document":
          this.updateDocumentsStmt.run(userUuid);
          break;
        default:
          throw new Error(`Unknown activity type: ${activityType}`);
      }

      logger.debug(`Tracked ${activityType} activity for user: ${userUuid}`);
    } catch (error) {
      // Don't throw - telemetry should never break the application
      logger.debug(
        `Failed to track user activity: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    try {
      this.db.close();
      logger.debug("User tracking database closed");
    } catch (error) {
      logger.debug(
        `Failed to close user tracking database: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
