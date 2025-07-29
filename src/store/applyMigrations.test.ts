// Integration test for database migrations using a real SQLite database

import Database, { type Database as DatabaseType } from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "./applyMigrations";

describe("Database Migrations", () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = new Database(":memory:");
    sqliteVec.load(db);
  });

  afterEach(() => {
    db.close();
  });

  it("should apply all migrations and create expected tables and columns", () => {
    expect(() => applyMigrations(db)).not.toThrow();

    // Check tables
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
      .all();
    interface TableRow {
      name: string;
    }
    const tableNames = (tables as TableRow[]).map((t) => t.name);
    expect(tableNames).toContain("documents");
    expect(tableNames).toContain("documents_fts");
    expect(tableNames).toContain("documents_vec");
    expect(tableNames).toContain("libraries");

    // Check columns for 'documents'
    const documentsColumns = db.prepare("PRAGMA table_info(documents);").all();
    interface ColumnInfo {
      name: string;
    }
    const documentsColumnNames = (documentsColumns as ColumnInfo[]).map(
      (col) => col.name,
    );
    expect(documentsColumnNames).toEqual(
      expect.arrayContaining([
        "id",
        "library_id",
        "version",
        "url",
        "content",
        "metadata",
        "sort_order",
        "indexed_at",
      ]),
    );

    // Check columns for 'libraries'
    const librariesColumns = db.prepare("PRAGMA table_info(libraries);").all();
    const librariesColumnNames = (librariesColumns as ColumnInfo[]).map(
      (col) => col.name,
    );
    expect(librariesColumnNames).toEqual(expect.arrayContaining(["id", "name"]));

    // Check FTS virtual table
    const ftsTableInfo = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='documents_fts';",
      )
      .get() as { sql: string } | undefined;
    expect(ftsTableInfo?.sql).toContain("VIRTUAL TABLE documents_fts USING fts5");

    // Check vector virtual table
    const vecTableInfo = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='documents_vec';",
      )
      .get() as { sql: string } | undefined;
    expect(vecTableInfo?.sql).toMatch(/CREATE VIRTUAL TABLE documents_vec USING vec0/i);

    // Check that vector table has the expected schema with library_id
    expect(vecTableInfo?.sql).toContain("library_id INTEGER NOT NULL");
    expect(vecTableInfo?.sql).toContain("version TEXT NOT NULL");
    expect(vecTableInfo?.sql).toContain("embedding FLOAT[1536]");
  });

  it("should preserve vector data when migrating from library names to library_id", () => {
    // Create a fresh database to test the migration step by step
    const migrationDb = new Database(":memory:");
    sqliteVec.load(migrationDb);

    // Apply first two migrations only
    const migration000 = `
      CREATE TABLE IF NOT EXISTS documents(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        library TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL,
        content TEXT,
        metadata JSON,
        sort_order INTEGER NOT NULL,
        UNIQUE(url, library, version, sort_order)
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_vec USING vec0(
        library TEXT NOT NULL,
        version TEXT NOT NULL,
        embedding FLOAT[1536]
      );
    `;

    const migration001 = "ALTER TABLE documents ADD COLUMN indexed_at DATETIME;";

    const migration002 = `
      CREATE TABLE IF NOT EXISTS libraries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );
      ALTER TABLE documents ADD COLUMN library_id INTEGER REFERENCES libraries(id);
      INSERT OR IGNORE INTO libraries (name) SELECT DISTINCT library FROM documents;
      UPDATE documents SET library_id = (SELECT id FROM libraries WHERE libraries.name = documents.library);
    `;

    migrationDb.exec(migration000);
    migrationDb.exec(migration001);

    // Insert test data before migration 002
    migrationDb
      .prepare(
        "INSERT INTO documents (library, version, url, content, metadata, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        "react",
        "18.0.0",
        "https://react.dev",
        "React content",
        '{"title":"React"}',
        0,
      );
    migrationDb
      .prepare(
        "INSERT INTO documents (library, version, url, content, metadata, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("vue", "3.0.0", "https://vuejs.org", "Vue content", '{"title":"Vue"}', 0);

    // Insert vector data with old schema
    migrationDb
      .prepare(
        "INSERT INTO documents_vec (rowid, library, version, embedding) VALUES (?, ?, ?, ?)",
      )
      .run(BigInt(1), "react", "18.0.0", JSON.stringify(new Array(1536).fill(0.1)));
    migrationDb
      .prepare(
        "INSERT INTO documents_vec (rowid, library, version, embedding) VALUES (?, ?, ?, ?)",
      )
      .run(BigInt(2), "vue", "3.0.0", JSON.stringify(new Array(1536).fill(0.2)));

    // Verify vector data exists before migration
    const vectorCountBefore = migrationDb
      .prepare("SELECT COUNT(*) as count FROM documents_vec")
      .get() as { count: number };
    expect(vectorCountBefore.count).toBe(2);

    // Apply migrations 002 and 003
    migrationDb.exec(migration002);

    const migration003 = `
      CREATE TEMPORARY TABLE temp_vector_data AS
      SELECT 
        dv.rowid,
        l.id as library_id,
        dv.version,
        dv.embedding
      FROM documents_vec dv
      JOIN documents d ON dv.rowid = d.id
      JOIN libraries l ON d.library_id = l.id;

      DROP TABLE documents_vec;

      CREATE VIRTUAL TABLE documents_vec USING vec0(
        library_id INTEGER NOT NULL,
        version TEXT NOT NULL,
        embedding FLOAT[1536]
      );

      INSERT INTO documents_vec (rowid, library_id, version, embedding)
      SELECT rowid, library_id, version, embedding
      FROM temp_vector_data;

      DROP TABLE temp_vector_data;
    `;

    migrationDb.exec(migration003);

    // Verify vector data is preserved after migration
    const vectorCountAfter = migrationDb
      .prepare("SELECT COUNT(*) as count FROM documents_vec")
      .get() as { count: number };
    expect(vectorCountAfter.count).toBe(2);

    // Verify library_id mapping is correct
    const vectorData = migrationDb
      .prepare(`
      SELECT dv.rowid, dv.library_id, dv.version, l.name as library_name
      FROM documents_vec dv
      JOIN libraries l ON dv.library_id = l.id
      ORDER BY dv.rowid
    `)
      .all() as Array<{
      rowid: number;
      library_id: number;
      version: string;
      library_name: string;
    }>;

    expect(vectorData).toHaveLength(2);
    expect(vectorData[0]).toMatchObject({
      rowid: 1,
      library_id: expect.any(Number),
      version: "18.0.0",
      library_name: "react",
    });
    expect(vectorData[1]).toMatchObject({
      rowid: 2,
      library_id: expect.any(Number),
      version: "3.0.0",
      library_name: "vue",
    });

    // Verify search still works
    const searchResult = migrationDb
      .prepare(`
      SELECT COUNT(*) as count
      FROM documents_vec dv
      JOIN libraries l ON dv.library_id = l.id
      WHERE l.name = ? AND dv.version = ?
    `)
      .get("react", "18.0.0") as { count: number };

    expect(searchResult.count).toBe(1);

    migrationDb.close();
  });
});
