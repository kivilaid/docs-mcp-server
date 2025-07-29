-- Migration: Normalize documents_vec table to use library_id

-- 1. Create temporary table to store existing vector data
CREATE TEMPORARY TABLE temp_vector_data AS
SELECT 
  dv.rowid,
  l.id as library_id,
  dv.version,
  dv.embedding
FROM documents_vec dv
JOIN documents d ON dv.rowid = d.id
JOIN libraries l ON d.library_id = l.id;

-- 2. Drop the old virtual table (virtual tables don't support ALTER TABLE)
DROP TABLE documents_vec;

-- 3. Create new virtual table with library_id
CREATE VIRTUAL TABLE documents_vec USING vec0(
  library_id INTEGER NOT NULL,
  version TEXT NOT NULL,
  embedding FLOAT[1536]
);

-- 4. Restore vector data with library_id instead of library name
INSERT INTO documents_vec (rowid, library_id, version, embedding)
SELECT rowid, library_id, version, embedding
FROM temp_vector_data;

-- 5. Clean up temporary table
DROP TABLE temp_vector_data;
