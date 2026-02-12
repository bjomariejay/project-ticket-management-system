CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL,
  handle TEXT UNIQUE NOT NULL,
  location TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  ticket_prefix TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channel_sequences (
  channel_id UUID PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
  last_value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY,
  ticket_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  estimated_hours NUMERIC(6,2),
  actual_hours NUMERIC(6,2),
  started_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  archived_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_ticket_timestamp ON tickets;
CREATE TRIGGER set_ticket_timestamp
BEFORE UPDATE ON tickets
FOR EACH ROW EXECUTE FUNCTION update_ticket_timestamp();

CREATE TABLE IF NOT EXISTS ticket_members (
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'participant',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY(ticket_id, user_id)
);

CREATE TABLE IF NOT EXISTS ticket_logs (
  id UUID PRIMARY KEY,
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID PRIMARY KEY,
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  mentions TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source_ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dms (
  id UUID PRIMARY KEY,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- seed users
INSERT INTO users (id, display_name, handle, location)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Ava Cruz', 'ava', 'Cebu City'),
  ('22222222-2222-2222-2222-222222222222', 'Noel Tan', 'noel', 'Manila'),
  ('33333333-3333-3333-3333-333333333333', 'Ivy Santos', 'ivy', 'Cebu HQ'),
  ('44444444-4444-4444-4444-444444444444', 'Liam Ortega', 'liam', 'Davao')
ON CONFLICT (id) DO NOTHING;

-- seed channels
INSERT INTO channels (id, name, slug, ticket_prefix, description)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cyber X HRMS', 'cyber_x_hrms', 'HRMS', 'HR operations pod'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Dev Ops Automation', 'dev_ops_automation', 'OPS', 'Automation squads')
ON CONFLICT (id) DO NOTHING;

INSERT INTO channel_sequences (channel_id, last_value)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 0),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 0)
ON CONFLICT (channel_id) DO NOTHING;
