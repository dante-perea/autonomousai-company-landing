CREATE TABLE IF NOT EXISTS application_rate_limits (
  address_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (address_hash, window_start)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS application_rate_limits_window_idx
ON application_rate_limits (window_start);
