// Data model documentation (deliverable D2). Mirrors server/db/schema.sql – update both together.

// [table, purpose, key columns, relationships, requirements, seeded rows]
export const ENTITY_GROUPS = [
  {
    group: 'Organisation, capacity and geography',
    tables: [
      ['clusters', 'Group of schools managed by a cluster officer; carries the emirate code used in references.', 'code, name_en / name_ar, emirate', '1 → many schools', 'SB-07', '1'],
      ['schools', 'An MoE school in the pilot cluster.', 'code, name_en / name_ar, area, lat / lng, gender', 'belongs to cluster; has sections, catchment, enrolments, applications', '§7', '12'],
      ['catchments', 'Geographic area a school serves, held as a GeoJSON Polygon / MultiPolygon.', 'school_id (PK), geojson, updated_at', '1 : 1 with school', 'CC-03, BR-03', '12'],
      ['areas', 'Named areas used by the mock map service to resolve emirate / area from a pin and for area search.', 'name_en / name_ar, emirate, geojson', '—', 'PP-07, PP-08', '13'],
      ['academic_years', 'School years; flags the running year and the year parents apply for.', 'code (PK, e.g. 2027-28), start / end date, is_current, is_admission', '1 → many windows', 'AD-01', '3'],
      ['windows', 'Open / close dates of the new-registration, renewal and transfer windows per academic year.', 'ay, type, open_date, close_date', 'belongs to academic year', 'AD-01, BR-14', '6'],
      ['sections', 'A class within a grade at a school for one academic year. Capacity is the sum of max_students – there is no stored capacity figure.', 'school_id, ay, grade, name (A, B…), max_students', 'belongs to school; referenced by enrolments and offers', 'CC-01, CC-02', '440'],
      ['capacity_alerts', 'Threshold crossings (warning % and 100%) per school and grade, with the date reached and cleared.', 'school_id, ay, grade (null = whole school), level, utilisation, reached_at, cleared_at', 'refers to school', 'CC-07, IR-05', '68'],
    ],
  },
  {
    group: 'People and families',
    tables: [
      ['users', 'Everyone who signs in: parents (created on first UAE PASS sign-in) and staff with their role, school or cluster scope and the force-registration permission.', 'role, emirates_id (unique), name_en / name_ar, email, mobile, school_id, cluster_id, force_registration, lang', 'staff → school or cluster; parent → guardian record', 'PP-01, AD-06, TR-02', '414'],
      ['sessions', 'Signed-in sessions (bearer tokens).', 'token, user_id', 'belongs to user', 'TR-02', '—'],
      ['families', 'One account per household: confirmed home pin (used for eligibility and bus pick-up), area, Makani, emergency contact, sole custody.', 'home_lat / home_lng, emirate, area, makani, residence_confirmed, sole_custody, emergency_*', '1 → many guardians, children, documents', 'PP-02, PP-03, PP-08', '200'],
      ['guardians', 'Parents / guardians linked to a family. A second guardian stays "pending" until they confirm through UAE PASS with a matching Emirates ID.', 'family_id, user_id, is_primary, status (active / pending), emirates_id, eid_expiry, nationality, relationship, preferred_channel', 'belongs to family; linked to user once confirmed', 'PP-02, PP-03, A16', '385'],
      ['children', 'A child / student. The Emirates ID is the unique student identifier. Siblings are children of the same family.', 'emirates_id (unique), names, dob, gender, nationality, passport_no, schooling_status, last_completed_grade, sod', 'belongs to family (null for background students); has enrolments and applications', 'PP-04, PP-06', '9,855'],
    ],
  },
  {
    group: 'Placements, applications and workflow',
    tables: [
      ['enrolments', 'A child’s placement at a school for one academic year – the record the SIS mock reads and writes. Seats held for current students awaiting renewal, leavers and released seats are all states of this one table.', 'child_id, school_id, ay, grade, section_id, status, source, force_registered, leave_* fields, leave_requested_at', 'child, school, section; optional application', 'CC-02, PP-19, PP-21, SB-08', '9,632'],
      ['applications', 'A new registration, transfer or renewal for one child and one academic year, with its ranked preferences, current school, offer, SLA clock, transport choice and escalation.', 'ref, type, pathway, grade, status, preferences (JSON), pref_index, current_school_id, offered_section_id, home pin, escalation_reason, exceptional, sla_due_at, paused_at, info_due_at, offer_due_at, first_decision_at, transport_mode, bus_route_id / bus_stop_id', 'child, family, current school, offered section; 1 → many events, documents, bus seat', 'PP-09…PP-22, SB-01…SB-07, BR-04…BR-11', '5,293'],
      ['application_events', 'Immutable timeline of every status change and action on an application (shown to parents and staff).', 'application_id, at, status, action, actor_user_id, school_id, note', 'belongs to application', 'PP-18, SB-09', '16,631'],
      ['documents', 'Metadata of an uploaded file (the file itself is in storage). Family-level documents (Emirates IDs, tenancy, utility bill) are reused by later applications unless expired.', 'family_id, child_id, application_id, doc_type, filename, mime, size, storage_path, expiry_date, issue_date, ref_number, status, reject_reason', 'family; optional child and application', 'PP-13, PP-14, SB-03', '2,217'],
    ],
  },
  {
    group: 'Transport',
    tables: [
      ['transport_routes', 'Bus routes with seat capacity and the schools they serve.', 'code, name_en / name_ar, capacity, school_ids (JSON)', '1 → many stops, seats', 'PP-15, IR-10', '6'],
      ['transport_stops', 'Stops on a route with coordinates (nearest stop is computed from the home pin).', 'route_id, name_en / name_ar, lat / lng', 'belongs to route', 'PP-15', '22'],
      ['bus_seats', 'A bus seat request: held from submission, confirmed on acceptance, waitlisted if the route is full, released on decline / lapse / withdrawal.', 'route_id, stop_id, child_id, application_id, ay, status', 'route, stop, child, application', 'BR-09, IR-10', '182'],
    ],
  },
  {
    group: 'Notifications and audit',
    tables: [
      ['notifications', 'Every message generated: in-portal, email (mock mailbox) and SMS (log), stored in both languages.', 'user_id, channel, to_address, template, subject_en / subject_ar, body_en / body_ar, application_id, read', 'recipient user; optional application', '§4.5', 'grows'],
      ['audit_log', 'Who did what and when, with the previous and new value and the reason (force registration, rule changes…).', 'at, user_id, user_name, role, action, entity, entity_id, prev_value, new_value, reason', '— (denormalised so it survives user changes)', 'SB-09, TR-04, CC-06', 'grows'],
    ],
  },
  {
    group: 'Configuration – rules as data',
    tables: [
      ['settings', 'Business rules and thresholds as JSON values (age rules, max preferences, priority order, SLA days, bill age, warning threshold, document matrix…).', 'key, value (JSON), updated_at', '—', 'AD-02, TR-03, §5, §6', '22'],
      ['lists', 'Maintained lists with English and Arabic labels: document types, rejection, leaving and sub-reasons, information-request and exceptional reasons, nationalities.', 'list_type, code, parent_code, label_en / label_ar, sort, active', 'sub-reasons point to their reason through parent_code', 'AD-03, BR-13', '65'],
      ['holidays', 'UAE public holidays for the working-day calendar.', 'date, name_en / name_ar', '—', 'AD-04', '24'],
      ['templates', 'Notification templates per event in English and Arabic with {{placeholders}}.', 'key, subject_en / subject_ar, body_en / body_ar', '—', 'AD-05', '29'],
      ['translations', 'Administrator overrides of any interface text (base text lives in resource files).', 'lang, key, value', '—', 'TR-07', '0'],
    ],
  },
  {
    group: 'Simulated external registers',
    tables: [
      ['mock_identities', 'Synthetic identity register behind the UAE PASS and ICP mocks. Removed when the real integrations are connected.', 'emirates_id (PK), names, dob, gender, nationality, mobile, email, eid_expiry, uaepass_account, note', '—', '§8', '10,340'],
    ],
  },
];

export const STATES = [
  ['applications.status', 'draft → submitted → under_review → (info_requested ↔ under_review) → offer_made → accepted; or passed (to next preference), escalated (cluster officer), rejected, withdrawn, lapsed, closed', '§5.1'],
  ['enrolments.status', 'enrolled · pending_renewal (seat held for a current student until renewal) · leaving (leaver confirmed, seat held until the leaving date) · left (seat released) · graduated', 'CC-02, SB-08'],
  ['bus_seats.status', 'held · confirmed · waitlisted · released', 'BR-09'],
  ['documents.status', 'pending · accepted · rejected (with reason)', 'SB-03'],
  ['guardians.status', 'pending (added by Emirates ID) · active (confirmed through UAE PASS)', 'PP-02'],
];

export const DECISIONS = [
  ['Seats are derived, never counted', 'Available seats = Σ section max_students − enrolled − held for renewal − outstanding offers, computed from the rows themselves. There is no counter that can drift, and capacity changes take effect immediately (CC-08). The check-and-offer runs in one serialised write transaction so only one request can take the last seat (CC-05).'],
  ['One placement table for the whole student lifecycle', 'enrolments carries current students, seats held for renewal, leavers until their leaving date and released seats, so capacity, renewals, leavers (IR-07) and net change (IR-08) all read the same records.'],
  ['Current state plus full history', 'applications holds the current state for fast queues and reports; application_events keeps the timeline; audit_log keeps previous / new values for every change (SB-09).'],
  ['Emirates ID as the natural key', 'Unique on users, children and the identity register, matching PP-01 (Parent ID) and PP-04 (student identifier).'],
  ['Bilingual by column', 'Reference data has _en / _ar columns; messages are stored in both languages so they can be shown or re-sent in either (TR-07).'],
  ['Rules as data', 'Section 5 rules, the Section 6 document matrix, lists, windows, holidays and templates are rows edited on screen; services read them at run time, so A13 needs no code change.'],
  ['Scoping columns for access control', 'school_id / cluster_id on users and current_school_id on applications let every query filter to the caller’s family, school or cluster (TR-02).'],
  ['Synthetic data is marked', 'applications.is_synthetic_volume flags the 5,000-application performance set so it can be excluded or purged.'],
];

// PoC choice → target in the PostgreSQL + PostGIS phase
export const TARGET = [
  ['Engine', 'SQLite file, synchronous driver, serialised write transactions', 'PostgreSQL with connection pool; SELECT … FOR UPDATE on the grade’s sections for the last-seat check'],
  ['Geometry', 'GeoJSON text in catchments.geojson / areas.geojson; lat / lng REAL columns; point-in-polygon in code', 'PostGIS geometry(MultiPolygon, 4326) with GIST index; home and stops as geography(Point); ST_Contains / ST_Distance in SQL'],
  ['Preferences', 'JSON array in applications.preferences', 'application_preferences (application_id, rank, school_id) table'],
  ['Route schools', 'JSON array in transport_routes.school_ids', 'route_schools join table'],
  ['Keys and types', 'INTEGER ids, TEXT ISO dates, 0 / 1 booleans', 'bigint identity or UUID, timestamptz / date, boolean, CHECK / ENUM types for statuses'],
  ['Settings values', 'TEXT holding JSON', 'jsonb'],
  ['Documents', 'Files in server/data/uploads', 'Object storage with virus scanning; table keeps metadata only'],
  ['Schema changes', 'Single schema.sql recreated by the seed', 'Versioned migrations'],
];

// Diagram boxes: [table, x, y, group colour key]
export const BOXES = [
  ['catchments', 30, 30, 'org'], ['schools', 270, 30, 'org'], ['sections', 510, 30, 'org'], ['clusters', 30, 130, 'org'], ['capacity_alerts', 760, 175, 'org'],
  ['users', 30, 250, 'people'], ['guardians', 30, 370, 'people'], ['families', 30, 490, 'people'], ['children', 270, 490, 'people'],
  ['enrolments', 270, 370, 'flow'], ['applications', 510, 490, 'flow'], ['application_events', 760, 490, 'flow'], ['documents', 270, 610, 'flow'],
  ['bus_seats', 760, 610, 'transport'], ['transport_routes', 1000, 610, 'transport'], ['transport_stops', 1000, 490, 'transport'],
  ['notifications', 760, 290, 'audit'],
];
// [from (holds the foreign key), to, label]
export const EDGES = [
  ['schools', 'clusters', 'cluster_id'], ['sections', 'schools', 'school_id'], ['catchments', 'schools', 'school_id'], ['capacity_alerts', 'schools', 'school_id'],
  ['users', 'clusters', ''], ['users', 'schools', 'school_id'], ['guardians', 'users', 'user_id'], ['guardians', 'families', 'family_id'], ['children', 'families', 'family_id'],
  ['enrolments', 'children', 'child_id'], ['enrolments', 'sections', 'section_id'], ['enrolments', 'schools', ''],
  ['applications', 'children', 'child_id'], ['applications', 'sections', 'offered_section_id'], ['applications', 'schools', 'current_school_id'],
  ['application_events', 'applications', 'application_id'], ['documents', 'families', ''], ['documents', 'children', ''], ['documents', 'applications', 'application_id'],
  ['bus_seats', 'applications', 'application_id'], ['bus_seats', 'transport_routes', 'route_id'], ['transport_stops', 'transport_routes', 'route_id'],
  ['notifications', 'users', ''],
];
