-- Forecast history for data portability and accuracy tracking
-- Tied to device fingerprint (no user accounts in v2.x)

CREATE TABLE IF NOT EXISTS forecast_history (
  id            BIGSERIAL PRIMARY KEY,
  fingerprint_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  location      TEXT NOT NULL,
  species       TEXT,
  clarity       TEXT,
  is_boat       BOOLEAN DEFAULT FALSE,
  model_used    TEXT,
  bite_probability INTEGER,
  bite_rank     TEXT,
  result        JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_forecast_history_fingerprint_created
  ON forecast_history (fingerprint_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecast_history_created
  ON forecast_history (created_at DESC);
