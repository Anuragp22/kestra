ALTER TABLE triggers ADD "type" VARCHAR(50) GENERATED ALWAYS AS (value ->> 'type') STORED;
ALTER TABLE triggers ADD "last_triggered_date" TIMESTAMPTZ GENERATED ALWAYS AS (PARSE_ISO8601_DATETIME(value ->> 'lastTriggeredDate')) STORED;

CREATE INDEX idx_trigger_type ON triggers ("type");
CREATE INDEX idx_trigger_last_triggered_date ON triggers ("last_triggered_date");
