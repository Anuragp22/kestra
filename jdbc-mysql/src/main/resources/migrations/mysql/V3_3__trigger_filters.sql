ALTER TABLE `triggers` ADD COLUMN `type` VARCHAR(50) GENERATED ALWAYS AS (value ->> '$.type') STORED;
ALTER TABLE `triggers` ADD COLUMN `last_triggered_date` DATETIME(6) GENERATED ALWAYS AS (STR_TO_DATE(value ->> '$.lastTriggeredDate','%Y-%m-%dT%H:%i:%s.%fZ')) STORED;

CREATE INDEX idx_trigger_type ON `triggers` (`type`);
CREATE INDEX idx_trigger_last_triggered_date ON `triggers` (`last_triggered_date`);
