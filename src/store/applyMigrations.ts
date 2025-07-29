import fs from "node:fs";
import path from "node:path";
import type { Database } from "better-sqlite3";
import { MIGRATION_MAX_RETRIES, MIGRATION_RETRY_DELAY_MS } from "../utils/config";
import { logger } from "../utils/logger";
import { getProjectRoot } from "../utils/paths";
import { StoreError } from "./errors";

// Construct the absolute path to the migrations directory using the project root
const MIGRATIONS_DIR = path.join(getProjectRoot(), "db", "migrations");
const MIGRATIONS_TABLE = "_schema_migrations";

/**
 * Ensures the migration tracking table exists in the database.
 * @param db The database instance.
 */
function ensureMigrationsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Retrieves the set of already applied migration IDs (filenames) from the tracking table.
 * @param db The database instance.
 * @returns A Set containing the IDs of applied migrations.
 */
function getAppliedMigrations(db: Database): Set<string> {
  const stmt = db.prepare(`SELECT id FROM ${MIGRATIONS_TABLE}`);
  const rows = stmt.all() as Array<{ id: string }>;
  return new Set(rows.map((row) => row.id));
}

/**
 * Applies pending database migrations found in the migrations directory.
 * Migrations are expected to be .sql files with sequential prefixes (e.g., 001-, 002-).
 * It tracks applied migrations in the _schema_migrations table.
 *
 * @param db The better-sqlite3 database instance.
 * @throws {StoreError} If any migration fails.
 */
export async function applyMigrations(db: Database): Promise<void> {
  const overallTransaction = db.transaction(() => {
    logger.debug("Applying database migrations...");
    ensureMigrationsTable(db);
    const appliedMigrations = getAppliedMigrations(db);

    if (!fs.existsSync(MIGRATIONS_DIR)) {
      throw new StoreError("Migrations directory not found");
    }

    const migrationFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort(); // Sort alphabetically, relying on naming convention (001-, 002-)

    let appliedCount = 0;
    for (const filename of migrationFiles) {
      if (!appliedMigrations.has(filename)) {
        logger.debug(`Applying migration: ${filename}`);
        const filePath = path.join(MIGRATIONS_DIR, filename);
        const sql = fs.readFileSync(filePath, "utf8");

        // Execute migration and record it directly within the overall transaction
        try {
          db.exec(sql);
          const insertStmt = db.prepare(
            `INSERT INTO ${MIGRATIONS_TABLE} (id) VALUES (?)`,
          );
          insertStmt.run(filename);
          logger.debug(`Successfully applied migration: ${filename}`);
          appliedCount++;
        } catch (error) {
          logger.error(`❌ Failed to apply migration: ${filename} - ${error}`);
          // Re-throw to ensure the overall transaction rolls back
          throw new StoreError(`Migration failed: ${filename}`, error);
        }
      }
    }

    if (appliedCount > 0) {
      logger.debug(`Applied ${appliedCount} new migration(s).`);
    } else {
      logger.debug("Database schema is up to date.");
    }
  });

  let retries = 0;

  while (true) {
    try {
      // Start a single IMMEDIATE transaction for the entire migration process
      overallTransaction.immediate(); // Execute the encompassing transaction
      logger.debug(
        "Migrations applied successfully or schema up to date after potential retries.",
      );
      break; // Success
    } catch (error) {
      // biome-ignore lint/suspicious/noExplicitAny: error can be any
      if ((error as any)?.code === "SQLITE_BUSY" && retries < MIGRATION_MAX_RETRIES) {
        retries++;
        logger.warn(
          `⚠️  Migrations busy (SQLITE_BUSY), retrying attempt ${retries}/${MIGRATION_MAX_RETRIES} in ${MIGRATION_RETRY_DELAY_MS}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, MIGRATION_RETRY_DELAY_MS));
      } else {
        // biome-ignore lint/suspicious/noExplicitAny: error can be any
        if ((error as any)?.code === "SQLITE_BUSY") {
          logger.error(
            `❌ Migrations still busy after ${MIGRATION_MAX_RETRIES} retries. Giving up: ${error}`,
          );
        }
        // Ensure StoreError is thrown for consistent handling
        if (error instanceof StoreError) {
          throw error;
        }
        throw new StoreError("Failed during migration process", error);
      }
    }
  }
}
