-- Add user tracking for persistent telemetry identification

CREATE TABLE IF NOT EXISTS user_tracking (
    id INTEGER PRIMARY KEY,
    user_uuid TEXT UNIQUE NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    platform TEXT,
    node_version TEXT,
    installation_id TEXT, -- Keep existing system-based ID as backup
    total_sessions INTEGER DEFAULT 1,
    total_commands INTEGER DEFAULT 0,
    total_documents_processed INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_user_tracking_uuid ON user_tracking(user_uuid);
CREATE INDEX IF NOT EXISTS idx_user_tracking_last_seen ON user_tracking(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_user_tracking_installation_id ON user_tracking(installation_id);
