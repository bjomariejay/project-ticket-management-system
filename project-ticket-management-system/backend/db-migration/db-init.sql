CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  handle TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  location TEXT,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS global_reports_last_seen TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_new_notifications BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS users_workspace_handle_unique
  ON users (workspace_id, LOWER(handle))
  WHERE LOWER(handle) <> 'admin';

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  ticket_prefix TEXT NOT NULL,
  description TEXT,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_sequences (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  last_value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY,
  ticket_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  estimated_hours NUMERIC(6,2),
  actual_hours NUMERIC(6,2),
  started_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  archived_at TIMESTAMP WITH TIME ZONE,
  privacy TEXT NOT NULL DEFAULT 'public',
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE tickets
   SET reviewer_id = creator_id
 WHERE reviewer_id IS NULL;

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

-- seed workspaces
INSERT INTO workspaces (id, name)
VALUES
  ('aaaaaaaa-1111-1111-1111-111111111111', 'CYBER-Workspace'),
  ('bbbbbbbb-2222-2222-2222-222222222222', 'SPEEDX-Workspace')
ON CONFLICT (id) DO NOTHING;

-- seed users
INSERT INTO users (id, display_name, username, handle, email, password_hash, location, workspace_id)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'Jaylingers',
    'jay',
    'admin',
    'jay@example.com',
    'efa1e58b8adbba359b491e544f23b8d7:72fe55279f69f8a53a298abdf7c024a714f3297e5019ae92dcf2846076a01d8ddae89d84c4beab72dbaff3acc1234254ffc14f066816e22f5f6c5c4b03e33032',
    'HQ',
    'aaaaaaaa-1111-1111-1111-111111111111'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Joji',
    'joji',
    'admin',
    'joji@example.com',
    '6f00585673a1a8108705b80bd568f23f:196714f853608770c43e591f3fecb367f1d313be602b34e731cc222fb9c285e1357e248fec9d8a6c2eb69b557f675e5f70120904270bbb8fe20194ff87c693c9',
    'CEBU',
    'aaaaaaaa-1111-1111-1111-111111111111'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'Lore',
    'lore',
    'user',
    'lore@example.com',
    '120bbf1cb1d70b195cc567687a258e7a:5755cf2486877a54e1bc9a6d94efbef2282c190f06b2a311c8c946bbc7f0e49c37a471f363d63f7ad00744cbbf482abfb04ab469480522998dde6d3764a7c879',
    'Mandaue',
    'aaaaaaaa-1111-1111-1111-111111111111'
  )
ON CONFLICT (id) DO NOTHING;

-- seed projects
INSERT INTO projects (id, name, slug, ticket_prefix, description, workspace_id)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'HRMS',
    'hrms',
    'hrms',
    'HRMS',
    'aaaaaaaa-1111-1111-1111-111111111111'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'AKONINI',
    'akonini',
    'akonini',
    'AKONINI',
    'aaaaaaaa-1111-1111-1111-111111111111'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO project_sequences (project_id, last_value)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 0),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 0)
ON CONFLICT (project_id) DO NOTHING;
