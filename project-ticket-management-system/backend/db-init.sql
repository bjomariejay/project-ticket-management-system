CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL,
  handle TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
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
  privacy TEXT NOT NULL DEFAULT 'public',
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
INSERT INTO users (id, display_name, handle, email, password_hash, location)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'Ava Cruz',
    'ava',
    'ava@example.com',
    '5adf1a0ce4c69f4a6a5bb05232bf891c:94ea88a051ca7d33603919efca0a2dbf680cd0087907aafdddb38f0a640afbd10c6c8f2a8b82b7dd0b0fd027f8c62716f4cf475ba928329848fa309838e56d13',
    'Cebu City'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Noel Tan',
    'noel',
    'noel@example.com',
    'f3a4238b7aa079b7abcc273d709b20ea:21514180e5ff11619000d9338fc44f38a9b41ec1e8ca995ec8c07fcdd7bd051d911f310fe697971a3af67513f6852238983fae35683e10fcd3e5e14c0f0be9f1',
    'Manila'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'Ivy Santos',
    'ivy',
    'ivy@example.com',
    '5067c6e56adc90c3edd27908d715e391:065ae81bc0afc6dd9471a9b36461fc5e8dda50204c27f8c9135399bc6e6c19094ea3a584f77bedb1e3140061463ba5ee56656721e28d9a275c2b3db7efcaf2a7',
    'Cebu HQ'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'Liam Ortega',
    'liam',
    'liam@example.com',
    '8c45a8e7ededecf93d7405c354193374:6d83d0fde7adb7c22a80f30e1bb7bde3639d3f2de04ec0cabbca58314eaec44f5569167b03f5bcd37cd26c79068ec0466c8821ed6346ccee3ea9c57c500f58ad',
    'Davao'
  )
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
