ALTER TABLE sheet_delivery_jobs ADD COLUMN available_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX sheet_delivery_job_available ON sheet_delivery_jobs(available_at,created_at,id) WHERE status='QUEUED';
GRANT UPDATE(available_at) ON sheet_delivery_jobs TO superagent_sheet_worker;
