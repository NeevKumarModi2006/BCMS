CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------- users ----------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  play_policy TEXT NOT NULL DEFAULT '3d' CHECK (play_policy IN ('3d','2d','1d')),
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- ---------- courts ----------
CREATE TABLE IF NOT EXISTS courts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  is_active BOOLEAN DEFAULT TRUE
);

-- ---------- bookings ----------
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  court_id INT REFERENCES courts(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','cancelled','expired','auto-cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_slot UNIQUE (court_id, start_time, end_time)
);

-- ---------- booking_participants ----------
CREATE TABLE IF NOT EXISTS booking_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  email TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','declined')),
  confirmed_at TIMESTAMPTZ,
  CONSTRAINT participant_unique UNIQUE (booking_id, user_id, email),
  CONSTRAINT user_or_email CHECK (user_id IS NOT NULL OR email IS NOT NULL)
);

-- ---------- blocks ----------
CREATE TABLE IF NOT EXISTS blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  court_id INT REFERENCES courts(id) ON DELETE CASCADE,
  lot TEXT CHECK (lot IN ('morning','evening')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- recent_cancellations ----------
CREATE TABLE IF NOT EXISTS recent_cancellations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES bookings(id),
  original_start TIMESTAMPTZ NOT NULL,
  original_end TIMESTAMPTZ NOT NULL,
  display_from TIMESTAMPTZ NOT NULL,
  display_to TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Second Edit 
INSERT INTO courts (name, location) VALUES
('Court 1', 'Main Hall'),
('Court 2', 'Main Hall'),
('Court 3', 'Main Hall');

-- Third Edit
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
-- Participant quick lookups
CREATE INDEX IF NOT EXISTS idx_participants_user ON booking_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_times ON bookings(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_bookings_creator ON bookings(creator_id);


--  ADMIN

CREATE TABLE IF NOT EXISTS admin_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_user_id UUID REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ
);