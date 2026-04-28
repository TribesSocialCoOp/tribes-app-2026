ALTER TABLE bonds ADD COLUMN connection_score INTEGER DEFAULT 0;
ALTER TABLE bonds ADD COLUMN last_interacted_at INTEGER;
ALTER TABLE bonds ADD COLUMN daily_score_added INTEGER DEFAULT 0;
