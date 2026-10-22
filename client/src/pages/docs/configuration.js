// Configuration guide: what can be configured in the portal, where, and by whom.
// Keep in step with the admin screens (client/src/pages/admin) and server/routes/admin.js.

// Columns of the "who can do what" matrix
export const ROLE_COLS = [
  ['admin', 'Ministry Administrator'],
  ['force', 'Admin with force-registration permission'],
  ['viewer', 'Ministry Viewer'],
  ['transport', 'Transport Coordinator'],
  ['school', 'Principal / Registrar'],
  ['cluster', 'Cluster Officer'],
  ['parent', 'Parent / Guardian'],
];

// [id, area, screen, path, { role: 'change' | 'view' }, what can be configured, takes effect, requirements]
export const CATALOGUE = [
  ['rules', 'Business rules (Section 5)', 'Rules & settings', '/admin/rules', { admin: 'change', force: 'change', viewer: 'view' },
    'Every Section 5 rule and the related thresholds – see "Business rule settings" below.', 'Immediately, for the next check or new application', 'AD-02, TR-03, A13'],
  ['docs', 'Document checklist per pathway (Section 6)', 'Rules & settings', '/admin/rules', { admin: 'change', force: 'change', viewer: 'view' },
    'Whether each document is Required, If applicable, Renewal-if-expired, Renewal-if-moved or Not required for each pathway, and the conditions (non-UAE nationals, student of determination, sole custody).', 'New checklists (applications still in draft pick it up)', 'PP-13, §6'],
  ['windows', 'Academic years and registration windows', 'Academic years & windows', '/admin/windows', { admin: 'change', force: 'change', viewer: 'view' },
    'Add an academic year with its start and end dates (its three windows are created with the usual dates, and grades and sections can be copied from another year); change dates; choose the current year and the admission year parents apply for; delete a year nothing uses. Open and close dates of the new-registration, renewal and transfer windows.', 'Immediately – windows are checked on every submission', 'AD-01, BR-14'],
  ['lists', 'Lists', 'Lists', '/admin/lists', { admin: 'change', force: 'change', viewer: 'view' },
    'Document types (with their row in the pathway matrix), rejection reasons, leaving reasons and sub-reasons, information-request reasons, exceptional-transfer reasons, nationalities. Add items, edit English / Arabic labels and order, deactivate items (items are never deleted, so history keeps its labels). Leaving requests only accept active reasons; a reason without sub-reasons asks for free text.', 'Immediately in every drop-down', 'AD-03, BR-13'],
  ['holidays', 'Working-day calendar', 'Working-day calendar', '/admin/holidays', { admin: 'change', force: 'change', viewer: 'view' },
    'UAE public holidays (add / remove). The working weekdays are a rule on Rules & settings.', 'Next deadline calculation', 'AD-04'],
  ['templates', 'Notification templates', 'Notification templates', '/admin/templates', { admin: 'change', force: 'change', viewer: 'view' },
    'Subject and body of every notification in English and Arabic, with {{placeholders}} such as {{ref}} and {{child}}.', 'Next message sent', 'AD-05, §4.5'],
  ['translations', 'Interface text', 'Translations', '/admin/translations', { admin: 'change', force: 'change', viewer: 'view' },
    'Override any label or message of the interface in English or Arabic; clearing an override restores the text from the resource file.', 'Next page load', 'TR-07'],
  ['users', 'Staff users, roles and permissions', 'Users & roles', '/admin/users', { admin: 'change', force: 'change', viewer: 'view' },
    'Add staff users, change their role, assign the school (registrar, principal) or cluster (cluster officer), grant or remove the force-registration permission, deactivate users. Parents are not managed here – they sign up with UAE PASS.', 'Immediately (next request)', 'AD-06, TR-02'],
  ['capacity', 'Capacity and sections', 'Capacity & sections', '/admin/capacity', { admin: 'change', force: 'change', viewer: 'view', school: 'view' },
    'Per school and academic year: grades offered, number of sections per grade, maximum students per section. Capacity is calculated from these. Principals and registrars see their own school’s figures (School capacity).', 'Immediately – seats, closures and alerts recalculate', 'CC-01, CC-02, CC-08'],
  ['force', 'Force registration', 'Capacity & sections / Application review', '/admin/capacity', { force: 'change' },
    'Not a setting but a controlled action: place a child above capacity with a mandatory reason. Only shown to administrators holding the permission.', 'Immediately; audited', 'CC-06, A7'],
  ['catchments', 'Catchment boundaries', 'Catchments', '/admin/catchments', { admin: 'change', force: 'change', viewer: 'view' },
    'Draw a school’s catchment on the map or upload it as GeoJSON (Shapefile not supported in the PoC).', 'Immediately for school search', 'CC-03, CC-08'],
  ['routes', 'Bus route capacity', 'Transport', '/transport', { transport: 'change', admin: 'view', force: 'view', viewer: 'view' },
    'Seat capacity of each bus route; the coordinator also confirms held or waitlisted seat requests.', 'Immediately for seat status', 'PP-15, IR-10'],
  ['demo', 'Demo clock and scheduled jobs (PoC only)', 'Demo controls', '/admin/demo', { admin: 'change', force: 'change' },
    'Move "today" forward to demonstrate deadlines, offer lapses and leaving-date releases; run the scheduled jobs on demand. Not part of the production design.', 'Immediately', '—'],
  ['family', 'Own family settings (self-service)', 'Profile & home', '/parent/profile', { parent: 'change' },
    'Preferred contact channel, nationality and Emirates ID expiry of guardians, emergency contact, sole custody, adding a second guardian, home location. Identity details from UAE PASS cannot be edited.', 'Immediately for this family', 'PP-01…PP-03, PP-08'],
  ['audit', 'Audit log', 'Audit log', '/admin/audit', { admin: 'view', force: 'view', viewer: 'view' },
    'Not configurable – every change above is listed with user, role, time, previous and new value and reason, and can be exported to Excel.', '—', 'SB-09, TR-04'],
];

// [setting key, rule, what it controls, starting value, options]
export const RULE_SETTINGS = [
  ['grade_age_rules', 'BR-01', 'Grade for new entrants by age on the cut-off date', 'Cut-off 31 Dec; KG1 = 4, KG2 = 5, Grade 1 = 6', 'Cut-off date and the age for each entry grade'],
  ['transfer_grade_rule', 'BR-02', 'Grade for transfers', 'Next grade after the last completed grade, for all transfer sources', 'Per source (private, other emirate, abroad, between MoE schools): next grade or by age'],
  ['eligible_schools_rule', 'BR-03', 'Schools shown to a parent', 'Catchment contains the home pin + school offers the grade', 'Catchment + grade · catchment or within N km · any school in the cluster'],
  ['max_preferences', 'BR-04', 'Maximum ranked schools', '3', 'Any number'],
  ['priority_order', 'BR-05', 'Priority when applications exceed seats', 'SoD, sibling, UAE national, distance, earliest submission', 'Re-order the five factors'],
  ['decision_sla_working_days', 'BR-06', 'First decision after submission', '2 working days', 'Any number of working days'],
  ['info_response_working_days', 'BR-07', 'Parent response to an information request', '5 working days', 'Any number of working days'],
  ['offer_acceptance_working_days', 'BR-08', 'Offer acceptance period', '5 working days', 'Any number of working days'],
  ['bus_seat_hold', 'BR-09', 'Bus seat hold, confirmation and release', 'Hold from submission, confirm on acceptance, release on decline / lapse / withdrawal / rejection / closure', 'Hold from submission / offer / acceptance; confirm on offer / acceptance; choose the releasing endings'],
  ['utility_bill_max_age_months', 'BR-10', 'Maximum age of the utility bill', '3 months', 'Any number of months'],
  ['max_active_applications_per_child', 'BR-11', 'Active applications per child per academic year', '1', 'Any number'],
  ['capacity_warning_threshold', 'BR-12', 'Capacity warning threshold', '90%', 'Any percentage (alerts recalculated on save)'],
  ['Lists → leaving reasons', 'BR-13', 'Leaving reasons and sub-reasons', 'Section 5.2 list', 'Add / rename / deactivate on the Lists screen'],
  ['exceptional_transfer_approver', 'BR-14', 'Who approves transfers outside the window', 'Cluster Officer', 'Cluster Officer · Ministry Administrator · no prior approval (school decides)'],
  ['limited_seat_pct', 'PP-10', '"Limited" seat status shown to parents', '10% of capacity left', 'Any percentage'],
  ['out_of_catchment_suggestions', 'PP-11', 'Alternative schools suggested when no seat', '3', 'Any number'],
  ['working_weekdays', 'AD-04', 'Working weekdays', 'Monday – Friday', 'Any days of the week'],
  ['max_file_mb / allowed_file_types', 'PP-13', 'Upload limits', '5 MB; PDF, JPG, PNG', 'Size and file types'],
  ['doc_matrix / doc_conditions', '§6', 'Documents required by pathway', 'Section 6 table', 'R / C / E / M / – per document and pathway'],
  ['default_emirate', 'PP-17', 'Emirate code in reference numbers', 'SHJ', 'Any emirate code'],
];

export const GOVERNANCE = [
  ['Audited', 'Every configuration change is written to the audit log with the user, role, time, previous value, new value and an optional reason.'],
  ['Enforced on the server', 'The API refuses changes from any role that is not allowed, including the Ministry Viewer – hiding a button is not the only control.'],
  ['Validated', 'Structured rules (BR-02, BR-03, BR-09, BR-14) are checked before saving; an invalid combination is refused, not silently ignored.'],
  ['No code change', 'All of the above is held as data, so the Ministry can load its own values on acceptance day (A13) without a new release.'],
  ['Forward-looking', 'Changes apply to the next check or new application. Values already applied are kept – e.g. a decision deadline already calculated is not recalculated when the SLA rule changes.'],
];

export const NOT_CONFIGURABLE = [
  ['Branding and theme', 'Colours, logo and banner text follow the MoE / UAE Design System and are set in code.'],
  ['Landing page and menus', 'Which roles appear on the landing page and the menu items per role.'],
  ['Grades, cycles, pathways and transport modes', 'The grade list (KG1–G12), cycles, the four pathways and the four transport options. The reference number pattern is fixed (only the emirate code is a setting).'],
  ['Annual roll-over', 'Rolling current students forward into a new admission year (creating their seats held for renewal) is not automated yet.'],
  ['Notification routing', 'Which events go to which recipients and channels (only the wording is configurable).'],
  ['Forms', 'Wizard steps, which child / guardian fields are shown or required, and the declaration texts (wording can be changed through Translations).'],
  ['Escalation routing', 'Out-of-catchment and alternative-residence applications always go to the cluster officer first (exceptional transfers follow BR-14).'],
  ['Permissions per role', 'What each role may do is defined in code; administrators can only assign roles and the force-registration permission.'],
  ['Integrations and dashboards', 'Mock / real service settings and dashboard tiles per role.'],
];
