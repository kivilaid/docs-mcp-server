-- Migration: Normalize documents_vec table to use library_id
-- Optimized for large datasets (1GB+)

-- 1. Ensure optimal indexes for the migration JOIN
CREATE INDEX IF NOT EXISTS idx_documents_id_library_id ON documents(id, library_id);

-- 2. Create temporary table to store vector data with library_id
CREATE TEMPORARY TABLE temp_vector_migration AS
SELECT 
  dv.rowid,
  d.library_id,
  dv.version,
  dv.embedding
FROM documents_vec dv
JOIN documents d ON dv.rowid = d.id;

-- 3. Drop the old virtual table
DROP TABLE documents_vec;

-- 4. Create new virtual table with correct schema
CREATE VIRTUAL TABLE documents_vec USING vec0(
  library_id INTEGER NOT NULL,
  version TEXT NOT NULL,
  embedding FLOAT[1536]
);

-- 5. Restore vector data with library_id
INSERT INTO documents_vec (rowid, library_id, version, embedding)
SELECT rowid, library_id, version, embedding
FROM temp_vector_migration;

-- 6. Clean up temporary table
DROP TABLE temp_vector_migration;
