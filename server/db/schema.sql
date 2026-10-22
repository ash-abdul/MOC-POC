-- MoE School Registration Portal PoC - relational data model (SQLite for the PoC; portable to PostgreSQL)
PRAGMA foreign_keys = ON;

CREATE TABLE clusters (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  emirate TEXT NOT NULL            -- emirate code, e.g. SHJ
);

CREATE TABLE schools (
  id INTEGER PRIMARY KEY,
  cluster_id INTEGER NOT NULL REFERENCES clusters(id),
  code TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  area_en TEXT NOT NULL,
  area_ar TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  gender TEXT NOT NULL DEFAULT 'mixed'
);

-- Catchment boundary per school (GeoJSON Polygon / MultiPolygon geometry)
CREATE TABLE catchments (
  school_id INTEGER PRIMARY KEY REFERENCES schools(id),
  geojson TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Map areas used to resolve the emirate / area name of a pin (mock reverse geocoder)
CREATE TABLE areas (
  id INTEGER PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  emirate TEXT NOT NULL,
  geojson TEXT NOT NULL,
  makani_prefix TEXT
);

CREATE TABLE academic_years (
  code TEXT PRIMARY KEY,           -- e.g. 2027-28
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,     -- the running school year
  is_admission INTEGER NOT NULL DEFAULT 0    -- the year parents are applying for
);

-- Registration / renewal / transfer windows (AD-01)
CREATE TABLE windows (
  id INTEGER PRIMARY KEY,
  ay TEXT NOT NULL REFERENCES academic_years(code),
  type TEXT NOT NULL CHECK (type IN ('new','renewal','transfer')),
  open_date TEXT NOT NULL,
  close_date TEXT NOT NULL,
  UNIQUE (ay, type)
);

-- CC-01: sections per school / AY / grade. Capacity = sum(max_students)
CREATE TABLE sections (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  ay TEXT NOT NULL,
  grade TEXT NOT NULL,             -- KG1, KG2, G1 .. G12
  name TEXT NOT NULL,              -- A, B, C ...
  max_students INTEGER NOT NULL,
  UNIQUE (school_id, ay, grade, name)
);
CREATE INDEX ix_sections_school ON sections(school_id, ay, grade);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('parent','registrar','principal','cluster_officer','ministry_admin','ministry_viewer','transport')),
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  emirates_id TEXT UNIQUE,
  email TEXT,
  mobile TEXT,
  school_id INTEGER REFERENCES schools(id),
  cluster_id INTEGER REFERENCES clusters(id),
  force_registration INTEGER NOT NULL DEFAULT 0,
  lang TEXT NOT NULL DEFAULT 'en',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE families (
  id INTEGER PRIMARY KEY,
  home_lat REAL,
  home_lng REAL,
  emirate TEXT,
  area_en TEXT,
  area_ar TEXT,
  makani TEXT,
  residence_confirmed INTEGER NOT NULL DEFAULT 0,
  sole_custody INTEGER NOT NULL DEFAULT 0,
  emergency_name TEXT,
  emergency_relationship TEXT,
  emergency_mobile TEXT,
  created_at TEXT NOT NULL
);

-- PP-02 / PP-03 guardians. user_id is set once the guardian has signed in with UAE PASS
CREATE TABLE guardians (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id),
  user_id INTEGER REFERENCES users(id),
  is_primary INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending')),
  emirates_id TEXT NOT NULL,
  eid_expiry TEXT,
  full_name_en TEXT,
  full_name_ar TEXT,
  nationality TEXT,
  mobile TEXT,
  email TEXT,
  relationship TEXT,               -- father, mother, guardian
  preferred_channel TEXT DEFAULT 'email',
  created_at TEXT NOT NULL,
  UNIQUE (family_id, emirates_id)
);

-- PP-04 children. Emirates ID is the unique student identifier
CREATE TABLE children (
  id INTEGER PRIMARY KEY,
  family_id INTEGER REFERENCES families(id),
  emirates_id TEXT UNIQUE NOT NULL,
  full_name_en TEXT NOT NULL,
  full_name_ar TEXT NOT NULL,
  dob TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('M','F')),
  nationality TEXT NOT NULL,
  passport_no TEXT,
  schooling_status TEXT,           -- none, moe, private, other_emirate, abroad
  last_completed_grade TEXT,
  sod INTEGER NOT NULL DEFAULT 0,  -- student of determination
  created_at TEXT NOT NULL
);
CREATE INDEX ix_children_family ON children(family_id);

-- Placement of a child at a school for an AY (the SIS mock reads/writes this table)
CREATE TABLE enrolments (
  id INTEGER PRIMARY KEY,
  child_id INTEGER NOT NULL REFERENCES children(id),
  school_id INTEGER NOT NULL REFERENCES schools(id),
  ay TEXT NOT NULL,
  grade TEXT NOT NULL,
  section_id INTEGER REFERENCES sections(id),
  -- enrolled: holds a seat; pending_renewal: seat held for a current student until renewal;
  -- leaving: leaver confirmed, seat held until leaving date; left: seat released; graduated
  status TEXT NOT NULL CHECK (status IN ('enrolled','pending_renewal','leaving','left','graduated')),
  source TEXT,                      -- renewal, new, transfer, force, seed
  application_id INTEGER,
  force_registered INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  leave_date TEXT,
  leave_reason TEXT,
  leave_subreason TEXT,
  leave_note TEXT,
  leave_destination TEXT,
  leave_requested_at TEXT,
  leave_requested_by INTEGER,
  left_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_enrol_seat ON enrolments(school_id, ay, grade, status);
CREATE INDEX ix_enrol_child ON enrolments(child_id, ay);

CREATE TABLE applications (
  id INTEGER PRIMARY KEY,
  ref TEXT UNIQUE,
  child_id INTEGER NOT NULL REFERENCES children(id),
  family_id INTEGER REFERENCES families(id),
  ay TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('new','transfer','renewal')),
  pathway TEXT NOT NULL,           -- new, private, other_emirate, abroad, moe_transfer, renewal
  grade TEXT NOT NULL,
  status TEXT NOT NULL,            -- see section 5.1
  preferences TEXT NOT NULL DEFAULT '[]',  -- JSON array of school ids in rank order
  pref_index INTEGER NOT NULL DEFAULT 0,
  current_school_id INTEGER REFERENCES schools(id),
  offered_section_id INTEGER REFERENCES sections(id),
  home_lat REAL,
  home_lng REAL,
  out_of_catchment INTEGER NOT NULL DEFAULT 0,
  cluster_review INTEGER NOT NULL DEFAULT 0,      -- alternative residence route or out of catchment
  escalation_reason TEXT,                         -- no_seat, out_of_catchment, exceptional_transfer, alternative_residence, school
  renewal_of_enrolment_id INTEGER,                -- renewal / renewal-converted transfer
  cluster_approved INTEGER,                      -- null = n/a or pending, 1 approved, 0 rejected
  exceptional INTEGER NOT NULL DEFAULT 0,
  exceptional_reason TEXT,
  residence_route TEXT DEFAULT 'own',            -- own, relatives, employer
  sibling_school_ids TEXT DEFAULT '[]',
  transport_mode TEXT,                            -- bus, dropoff, walk, private
  bus_route_id INTEGER,
  bus_stop_id INTEGER,
  declarations INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT,
  sla_due_at TEXT,
  first_decision_at TEXT,
  paused_at TEXT,
  info_due_at TEXT,
  info_request_note TEXT,
  offer_due_at TEXT,
  decided_at TEXT,
  end_reason TEXT,
  priority_score REAL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_synthetic_volume INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_app_school ON applications(current_school_id, status);
CREATE INDEX ix_app_child ON applications(child_id, ay);
CREATE INDEX ix_app_submitted ON applications(submitted_at);

CREATE TABLE application_events (
  id INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  at TEXT NOT NULL,
  status TEXT,
  action TEXT NOT NULL,
  actor_user_id INTEGER,
  school_id INTEGER,
  note TEXT
);
CREATE INDEX ix_events_app ON application_events(application_id);

CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  family_id INTEGER REFERENCES families(id),
  child_id INTEGER REFERENCES children(id),
  guardian_id INTEGER REFERENCES guardians(id),
  application_id INTEGER REFERENCES applications(id),
  doc_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_path TEXT,
  expiry_date TEXT,
  issue_date TEXT,
  ref_number TEXT,                 -- contract / account number (PP-14)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  reject_reason TEXT,
  uploaded_by INTEGER,
  uploaded_at TEXT NOT NULL
);
CREATE INDEX ix_docs_family ON documents(family_id);

CREATE TABLE transport_routes (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  school_ids TEXT NOT NULL         -- JSON array
);

CREATE TABLE transport_stops (
  id INTEGER PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES transport_routes(id),
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL
);

CREATE TABLE bus_seats (
  id INTEGER PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES transport_routes(id),
  stop_id INTEGER REFERENCES transport_stops(id),
  child_id INTEGER NOT NULL REFERENCES children(id),
  application_id INTEGER REFERENCES applications(id),
  ay TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('held','confirmed','waitlisted','released')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_seats_route ON bus_seats(route_id, status);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  channel TEXT NOT NULL CHECK (channel IN ('inapp','email','sms')),
  to_address TEXT,
  template TEXT,
  subject_en TEXT, subject_ar TEXT,
  body_en TEXT, body_ar TEXT,
  application_id INTEGER,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_notif_user ON notifications(user_id, channel);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  user_id INTEGER,
  user_name TEXT,
  role TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  prev_value TEXT,
  new_value TEXT,
  reason TEXT
);

CREATE TABLE capacity_alerts (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL,
  ay TEXT NOT NULL,
  grade TEXT,                      -- null = whole school
  level INTEGER NOT NULL,          -- 90 or 100 (threshold value at the time)
  utilisation REAL NOT NULL,
  reached_at TEXT NOT NULL,
  cleared_at TEXT
);

-- AD-02 rules as data
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,             -- JSON
  updated_at TEXT NOT NULL
);

-- AD-03 maintained lists
CREATE TABLE lists (
  id INTEGER PRIMARY KEY,
  list_type TEXT NOT NULL,         -- doc_type, reject_reason, leave_reason, leave_subreason, info_reason, exceptional_reason
  code TEXT NOT NULL,
  parent_code TEXT,
  label_en TEXT NOT NULL,
  label_ar TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (list_type, code)
);

CREATE TABLE holidays (
  date TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL
);

-- AD-05 bilingual notification templates
CREATE TABLE templates (
  key TEXT PRIMARY KEY,
  subject_en TEXT NOT NULL, subject_ar TEXT NOT NULL,
  body_en TEXT NOT NULL, body_ar TEXT NOT NULL
);

-- TR-07 translation overrides edited on screen (base text lives in resource files)
CREATE TABLE translations (
  lang TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (lang, key)
);

-- Mock UAE PASS / ICP identity register (synthetic people)
CREATE TABLE mock_identities (
  emirates_id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  dob TEXT,
  gender TEXT,
  nationality TEXT,
  mobile TEXT,
  email TEXT,
  eid_expiry TEXT,
  uaepass_account INTEGER NOT NULL DEFAULT 0,   -- has a UAE PASS account (adult)
  note TEXT
);
