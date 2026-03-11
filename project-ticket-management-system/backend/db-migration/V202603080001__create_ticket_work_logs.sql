CREATE TABLE IF NOT EXISTS ticket_work_logs (
  id UUID PRIMARY KEY,
  ticket_number TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  spend_time NUMERIC(6,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_work_logs_ticket
  ON ticket_work_logs (ticket_number);

CREATE INDEX IF NOT EXISTS idx_ticket_work_logs_user
  ON ticket_work_logs (user_id);
