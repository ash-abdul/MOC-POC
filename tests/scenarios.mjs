// API-level run of the acceptance scenarios (section 10.1) against a freshly seeded database.
//   npm run seed && PORT=3100 npm start   (in another terminal)
//   BASE=http://localhost:3100 node tests/scenarios.mjs
const BASE = process.env.BASE || 'http://localhost:3000';
let failures = 0;
const ok = (cond, msg, extra) => {
  console.log(`${cond ? '  ✔' : '  ✘'} ${msg}${!cond && extra ? ' → ' + JSON.stringify(extra).slice(0, 400) : ''}`);
  if (!cond) failures++;
};
async function call(token, method, url, body, raw = false) {
  const isForm = body instanceof FormData;
  const res = await fetch(BASE + '/api' + url, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const uaepass = async (eid) => (await call(null, 'POST', '/auth/uaepass', { emiratesId: eid })).data;
const personas = (await call(null, 'GET', '/auth/staff-personas')).data;
const staff = async (pred) => (await call(null, 'POST', '/auth/staff', { userId: personas.find(pred).id })).data.token;
const pdf = new Blob(['%PDF-1.4\n%synthetic\n'], { type: 'application/pdf' });
async function upload(token, fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('file', pdf, 'doc.pdf');
  return call(token, 'POST', '/family/documents', fd);
}
async function fillChecklist(token, appId, childId) {
  const { data } = await call(token, 'GET', `/family/applications/${appId}`);
  for (const c of data.checklist.filter((x) => !x.satisfied)) {
    const extra = c.doc_type === 'utility_bill' ? { ref_number: 'SEWA-1', issue_date: new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10) } : c.doc_type === 'tenancy' ? { ref_number: 'TC-1' } : {};
    const r = await upload(token, { doc_type: c.doc_type, child_id: childId, application_id: appId, ...extra });
    if (r.status !== 200) console.log('upload failed', c.doc_type, r.data);
  }
}
const lookups = (await call(null, 'GET', '/lookups')).data;
const sid = (code) => lookups.schools.find((s) => s.code === code).id;

console.log('A16 – UAE PASS sign-up and second guardian');
const noPwd = await call(null, 'POST', '/auth/login', { email: 'x', password: 'y' });
ok(noPwd.status === 404 || noPwd.status === 401, `no email/password sign-in route exists (${noPwd.status})`);
const f1 = await uaepass('784-1990-1234567-1');
ok(f1.familyCreated && f1.claims.idn === '784-1990-1234567-1', 'family account created with Parent ID from UAE PASS');
const F = f1.token;
const inv = await call(F, 'POST', '/family/guardians', { emiratesId: '784-1987-7654321-2', relationship: 'father' });
ok(inv.data.status === 'pending', 'second guardian added as pending');
const k1 = await uaepass('784-1987-7654321-2');
ok(k1.invites.length === 1 && !k1.familyCreated, 'second guardian sees invitation after UAE PASS sign-in');
const wrong = await call(F, 'POST', '/auth/guardian-link/confirm', { guardianId: k1.invites[0].id });
ok(wrong.status === 403, 'link refused when Emirates ID does not match');
const conf = await call(k1.token, 'POST', '/auth/guardian-link/confirm', { guardianId: k1.invites[0].id });
ok(conf.data.ok, 'second guardian linked after UAE PASS confirmation');

console.log('A1 – new KG1 registration');
await call(F, 'PUT', '/family/home', { lat: 25.3165, lng: 55.4262, confirmed: true });
const child = await call(F, 'POST', '/family/children', { emiratesId: '784-2023-1111111-1', schoolingStatus: 'none' });
ok(child.data.child?.eligible?.grade === 'KG1', 'eligible grade KG1 shown', child.data);
const mariam = child.data.child.id;
const draft = (await call(F, 'POST', '/family/applications', { childId: mariam, pathway: 'new' })).data;
const el = (await call(F, 'GET', `/family/eligible-schools?grade=KG1&childId=${mariam}`)).data;
const elCodes = el.eligible.map((s) => s.code).sort();
ok(JSON.stringify(elCodes) === JSON.stringify(['SHJ-S01', 'SHJ-S02', 'SHJ-S04']), 'only catchment schools offering KG1 listed', elCodes);
await call(F, 'PATCH', `/family/applications/${draft.id}`, { preferences: [sid('SHJ-S01'), sid('SHJ-S04'), sid('SHJ-S02')], transport_mode: 'bus', declarations: true });
await fillChecklist(F, draft.id, mariam);
const sub = await call(F, 'POST', `/family/applications/${draft.id}/submit`);
ok(/^ADM-\d{4}-SHJ-\d{6}$/.test(sub.data.ref || ''), `reference issued ${sub.data.ref}`, sub.data);
ok(sub.data.bus?.status === 'held', 'bus seat held');
const inbox = (await call(F, 'GET', '/notifications')).data;
ok(inbox.some((n) => n.template === 'application_submitted' && /2 working days/.test(n.body_en)), '2-working-day message received');

console.log('A2 – offer and acceptance');
const R1 = await staff((p) => p.role === 'registrar' && p.school_code === 'SHJ-S01');
const before = (await call(R1, 'GET', `/schools/${sid('SHJ-S01')}/capacity`)).data.grades.find((g) => g.grade === 'KG1');
const off = await call(R1, 'POST', `/applications/${draft.id}/offer`, {});
ok(off.data.status === 'offer_made', 'offer made', off.data);
const after = (await call(R1, 'GET', `/schools/${sid('SHJ-S01')}/capacity`)).data.grades.find((g) => g.grade === 'KG1');
ok(after.available === before.available - 1, `seats reduced ${before.available} → ${after.available}`);
const kTry = await call(k1.token, 'POST', `/family/applications/${draft.id}/withdraw`, {});
ok(kTry.status === 403, 'second guardian cannot withdraw');
const acc = await call(F, 'POST', `/family/applications/${draft.id}/accept`);
ok(acc.data.status === 'accepted' && acc.data.bus?.status === 'confirmed', 'status Accepted and bus seat confirmed', acc.data);

console.log('A3 – information request');
const noura = (await uaepass('784-1989-6666666-6')).token;
const nf = (await call(noura, 'GET', '/family')).data;
const hamadApp = nf.children[0].active_application.id;
const ri = await call(R1, 'POST', `/applications/${hamadApp}/request-info`, { reason: 'missing_document', note: 'Please upload a recent utility bill' });
ok(ri.data.status === 'info_requested', 'information requested, clock paused');
ok((await call(noura, 'GET', '/notifications')).data.some((n) => n.template === 'info_requested'), 'parent notified');
await upload(noura, { doc_type: 'utility_bill', application_id: hamadApp, ref_number: 'SEWA-9', issue_date: new Date().toISOString().slice(0, 10) });
const resp = await call(noura, 'POST', `/family/applications/${hamadApp}/respond`, { message: 'Uploaded' });
ok(resp.data.status === 'under_review', 'clock resumed after response');
const tl = (await call(noura, 'GET', `/family/applications/${hamadApp}`)).data.timeline.map((e) => e.action);
ok(tl.includes('sla_paused') && tl.includes('sla_resumed'), 'timeline shows pause and resume');

console.log('A6 / A4 – last seat race and automatic pass');
const R3 = await staff((p) => p.role === 'registrar' && p.school_code === 'SHJ-S03');
const q3 = (await call(R3, 'GET', '/queue?grade=KG1')).data.rows.filter((a) => a.status === 'under_review').slice(0, 2);
const [r1, r2] = await Promise.all(q3.map((a) => call(R3, 'POST', `/applications/${a.id}/offer`, {})));
ok([r1.status, r2.status].sort().join() === '200,409', `only one offer succeeds (${r1.status}, ${r2.status})`);
const loser = r1.status === 409 ? r1 : r2;
ok(loser.data.details?.app?.status === 'passed', 'other application passed to next preference automatically', loser.data);
const cap3 = (await call(R3, 'GET', `/schools/${sid('SHJ-S03')}/capacity`)).data.grades.find((g) => g.grade === 'KG1');
ok(cap3.closed && cap3.status === 'full', 'grade closed at 100%');

console.log('A7 – force registration');
const R12 = await staff((p) => p.role === 'registrar' && p.school_code === 'SHJ-S12');
ok((await call(R12, 'GET', `/schools/${sid('SHJ-S12')}/capacity`)).data.can_force === false, 'registrar: option not displayed');
const omar = await staff((p) => p.role === 'ministry_admin' && !p.force_registration);
ok((await call(omar, 'GET', `/schools/${sid('SHJ-S12')}/capacity`)).data.can_force === false, 'admin without permission: option not displayed');
ok((await call(omar, 'POST', '/admin/force-register', { appId: 1, sectionId: 1, reason: 'x' })).status === 403, 'admin without permission: API refuses');
const hessa = await staff((p) => p.role === 'ministry_admin' && p.force_registration);
const cands = (await call(hessa, 'GET', '/admin/force-candidates?grade=KG1')).data;
const hamdan = cands.find((c) => c.child_en.startsWith('Hamdan'));
const s12 = (await call(hessa, 'GET', `/schools/${sid('SHJ-S12')}/capacity`)).data;
const sec = s12.grades.find((g) => g.grade === 'KG1').sections[0];
const fr = await call(hessa, 'POST', '/admin/force-register', { appId: hamdan.id, sectionId: sec.id, reason: 'Student of determination – specialist support only available at this school' });
ok(fr.data.status === 'accepted', 'force registration above capacity succeeds', fr.data);
const aud = (await call(hessa, 'GET', '/admin/audit?action=force')).data;
ok(aud.some((a) => a.action === 'capacity.force_registration' && a.reason), 'audit entry with reason');

console.log('A8 – 90% and 100% alerts');
const q1 = (await call(R1, 'GET', '/queue?grade=KG2')).data.rows.find((a) => a.child_en === 'Salem Al Shamsi' && ['submitted', 'under_review'].includes(a.status));
await call(R1, 'POST', `/applications/${q1.id}/offer`, {});
const alerts = (await call(hessa, 'GET', '/reports/IR-05')).data.rows;
ok(alerts.some((a) => a.school.includes('Majaz') && a.grade === 'KG2' && a.level === 90), '90% alert raised for Al Majaz KG2');
ok(alerts.some((a) => a.school.includes('Qasimia Primary') && a.grade === 'KG1' && a.level === 100), '100% alert raised for Al Qasimia KG1');
const pri = await staff((p) => p.role === 'principal' && p.school_code === 'SHJ-S01');
ok((await call(pri, 'GET', '/mock/outbox?scope=mine')).data.some((m) => m.template === 'capacity_warning'), 'alert email sent to principal');

console.log('A5 – no seat in catchment');
const sara = (await uaepass('784-1992-7777777-7')).token;
const sf = (await call(sara, 'GET', '/family')).data;
const rawda = sf.children[0];
const el5 = (await call(sara, 'GET', `/family/eligible-schools?grade=KG1&childId=${rawda.id}`)).data;
ok(!el5.any_seat && el5.alternatives.length > 0 && el5.alternatives.every((a) => a.cluster_approval_required), 'alternatives shown, marked cluster approval required');
const d5 = (await call(sara, 'POST', '/family/applications', { childId: rawda.id, pathway: 'new' })).data;
await call(sara, 'PATCH', `/family/applications/${d5.id}`, { preferences: el5.alternatives.slice(0, 2).map((a) => a.id), transport_mode: 'dropoff', declarations: true });
await fillChecklist(sara, d5.id, rawda.id);
const s5 = await call(sara, 'POST', `/family/applications/${d5.id}/submit`);
ok(s5.data.status === 'escalated', 'application escalated to cluster', s5.data);
const CO = await staff((p) => p.role === 'cluster_officer');
const place = await call(CO, 'POST', `/applications/${d5.id}/cluster-place`, { schoolId: el5.alternatives[0].id });
ok(place.data.status === 'offer_made', 'cluster officer placed child at another school', place.data);

console.log('A9 – renewal after moving home');
const ahmed = (await uaepass('784-1985-2222222-2')).token;
const af = (await call(ahmed, 'GET', '/family')).data;
const omarC = af.children.find((c) => c.full_name_en.startsWith('Omar'));
ok(omarC.can_renew, 'renewal available for current student');
const rn = await call(ahmed, 'POST', `/family/children/${omarC.id}/renew`, { addressUnchanged: false, contactConfirmed: true, transportMode: 'dropoff' });
ok(rn.data.converted && rn.data.app.type === 'transfer', 'renewal converted to transfer', rn.data);
const ck = (await call(ahmed, 'GET', `/family/applications/${rn.data.app.id}`)).data.checklist;
ok(ck.some((c) => c.doc_type === 'tenancy' && c.needed) && ck.some((c) => c.doc_type === 'utility_bill' && c.needed), 'new residence proof required');

console.log('A10 – new sibling');
const ys = await call(ahmed, 'POST', '/family/children', { emiratesId: '784-2023-5555555-5', schoolingStatus: 'none' });
const el10 = (await call(ahmed, 'GET', `/family/eligible-schools?grade=KG1&childId=${ys.data.child.id}`)).data;
ok(el10.eligible.find((s) => s.code === 'SHJ-S04')?.sibling === true, 'sibling flagged at Al Taawun Primary');

console.log('A11 – leaving request');
const rashid = (await uaepass('784-1980-8888888-8')).token;
const rf = (await call(rashid, 'GET', '/family')).data;
const sultan = rf.children.find((c) => c.full_name_en.startsWith('Sultan'));
const today = (await call(null, 'GET', '/lookups')).data.today;
await call(rashid, 'POST', `/family/children/${sultan.id}/leave`, { reason: 'private_school', subreason: 'fees', leaveDate: today, destination: 'Private school' });
const R7 = await staff((p) => p.role === 'registrar' && p.school_code === 'SHJ-S07');
const reqs = (await call(R7, 'GET', '/leavers?view=requests')).data;
const lr = reqs.find((x) => x.child_en.startsWith('Sultan'));
const cf = await call(R7, 'POST', `/leavers/${lr.id}/confirm`, {});
ok(cf.data.status === 'left', 'seat released on leaving date', cf.data);
const viewer = await staff((p) => p.role === 'ministry_viewer');
const ir7 = (await call(viewer, 'GET', `/reports/IR-07?from=${today}&to=${today}`)).data;
ok(ir7.rows.some((r) => r.subreason === 'Fees'), 'leaver in IR-07 with reason and sub-reason');

console.log('A14 – exceptional transfer');
const hessaC = rf.children.find((c) => c.full_name_en.startsWith('Hessa'));
const d14 = (await call(rashid, 'POST', '/family/applications', { childId: hessaC.id, pathway: 'moe_transfer' })).data;
ok(d14.exceptional === 1, 'transfer outside window flagged exceptional');
const el14 = (await call(rashid, 'GET', `/family/eligible-schools?grade=${d14.grade}&childId=${hessaC.id}`)).data;
await call(rashid, 'PATCH', `/family/applications/${d14.id}`, { preferences: [el14.eligible.find((s) => s.seat_status !== 'full').id], transport_mode: 'dropoff', declarations: true });
let s14 = await call(rashid, 'POST', `/family/applications/${d14.id}/submit`);
ok(s14.status === 400, 'reason and document required', s14.data);
await call(rashid, 'PATCH', `/family/applications/${d14.id}`, { exceptional_reason: 'medical' });
await fillChecklist(rashid, d14.id, hessaC.id);
s14 = await call(rashid, 'POST', `/family/applications/${d14.id}/submit`);
ok(s14.data.status === 'escalated' && s14.data.escalation_reason === 'exceptional_transfer', 'sent to cluster officer first', s14.data);
const schoolQ = await staff((p) => p.role === 'registrar' && p.school_code === lookups.schools.find((x) => x.id === s14.data.current_school_id).code);
ok(!(await call(schoolQ, 'GET', '/queue')).data.rows.some((a) => a.id === d14.id && a.status !== 'escalated'), 'school does not receive it before approval');
const ap = await call(CO, 'POST', `/applications/${d14.id}/cluster-approve`, {});
ok(ap.data.status === 'submitted', 'after approval the school receives it');

console.log('A12 – reports');
for (let i = 1; i <= 10; i++) {
  const id = `IR-${String(i).padStart(2, '0')}`;
  const rep = await call(viewer, 'GET', `/reports/${id}?from=2026-09-01&to=${today}&gender=F`);
  const x = await call(viewer, 'GET', `/reports/${id}/export?lang=ar`, null, true);
  ok(rep.status === 200 && Array.isArray(rep.data.rows) && x.status === 200 && x.headers.get('content-type').includes('spreadsheet'), `${id}: ${rep.data.rows?.length} rows, Excel export ok`);
}

console.log('A13 – rules as data; viewer is read-only');
ok((await call(viewer, 'PUT', '/admin/settings/max_preferences', { value: 2 })).status === 403, 'Ministry Viewer cannot change settings');
await call(hessa, 'PUT', '/admin/settings/max_preferences', { value: 2 });
const d13 = (await call(ahmed, 'POST', '/family/applications', { childId: ys.data.child.id, pathway: 'new' })).data;
const tooMany = await call(ahmed, 'PATCH', `/family/applications/${d13.id}`, { preferences: el10.eligible.slice(0, 3).map((s) => s.id) });
ok(tooMany.status === 400 && tooMany.data.error === 'too_many_preferences', 'new rule applied without code change');
ok((await call(hessa, 'GET', '/admin/audit?action=setting.changed')).data.length > 0, 'audit entry created');
await call(hessa, 'PUT', '/admin/settings/max_preferences', { value: 3 });

console.log('BR-02 / BR-03 / BR-09 / BR-14 – configurable rules take effect');
const RULES = ['transfer_grade_rule', 'eligible_schools_rule', 'bus_seat_hold', 'exceptional_transfer_approver'];
const allSettings = (await call(hessa, 'GET', '/admin/settings')).data;
const saved = Object.fromEntries(RULES.map((k) => [k, allSettings.find((x) => x.key === k).value]));
const setRule = (k, value) => call(hessa, 'PUT', `/admin/settings/${k}`, { value, reason: 'scenario test' });
ok((await setRule('bus_seat_hold', { hold_from: 'acceptance', confirm_on: 'offer', release_on: [] })).status === 400, 'invalid rule value is refused');
ok((await call(viewer, 'PUT', '/admin/settings/exceptional_transfer_approver', { value: 'school' })).status === 403, 'Ministry Viewer cannot change BR-14');

// BR-02: transfers from abroad placed by age instead of next grade
const eg = async () => (await call(null, 'GET', '/lookups/eligible-grade?dob=2015-03-01&last=G1&pathway=abroad')).data.grade;
const g0 = await eg();
await setRule('transfer_grade_rule', { ...saved.transfer_grade_rule, abroad: 'by_age' });
const g1 = await eg();
ok(g0 === 'G2' && g1 === 'G7', `BR-02 transfer from abroad: ${g0} (next grade) → ${g1} (by age)`);

// BR-03: widen eligibility from catchment to the whole cluster
const n0 = (await call(F, 'GET', '/family/eligible-schools?grade=KG1')).data.eligible.length;
await setRule('eligible_schools_rule', { mode: 'grade_in_cluster', radius_km: 3 });
const n1 = (await call(F, 'GET', '/family/eligible-schools?grade=KG1')).data.eligible.length;
ok(n0 === 3 && n1 > n0, `BR-03 schools listed for the same home: ${n0} (catchment) → ${n1} (cluster)`);
await setRule('eligible_schools_rule', saved.eligible_schools_rule);

// BR-09: hold and confirm the bus seat at the offer instead of submission / acceptance
await setRule('bus_seat_hold', { hold_from: 'offer', confirm_on: 'offer', release_on: ['decline', 'lapse', 'withdrawal', 'rejection', 'closure'] });
await call(ahmed, 'PATCH', `/family/applications/${d13.id}`, { preferences: [sid('SHJ-S04')], transport_mode: 'bus', declarations: true });
await fillChecklist(ahmed, d13.id, ys.data.child.id);
const s09 = await call(ahmed, 'POST', `/family/applications/${d13.id}/submit`);
ok(s09.status === 200 && !s09.data.bus?.status, 'BR-09 no seat held at submission', s09.data);
const R4 = await staff((p) => p.role === 'registrar' && p.school_code === 'SHJ-S04');
await call(R4, 'POST', `/applications/${d13.id}/offer`, {});
const t09 = (await call(ahmed, 'GET', `/family/applications/${d13.id}`)).data.app;
ok(t09.status === 'offer_made' && t09.bus?.status === 'confirmed', 'BR-09 seat held and confirmed at the offer', t09.bus);

// BR-14: exceptional transfers – no prior approval, then Ministry Administrator approval
const excCands = [];
for (const a of (await call(null, 'GET', '/auth/uaepass/accounts')).data.filter((x) => !x.note)) {
  if (excCands.length >= 2) break;
  const tk = (await uaepass(a.emirates_id)).token;
  const fam = (await call(tk, 'GET', '/family')).data;
  const c = fam.children?.find((x) => x.enrolment?.status === 'enrolled' && x.can_apply);
  if (c) excCands.push({ tk, c });
}
async function exceptional({ tk, c }) {
  const d = (await call(tk, 'POST', '/family/applications', { childId: c.id, pathway: 'moe_transfer' })).data;
  const el = (await call(tk, 'GET', `/family/eligible-schools?grade=${d.grade}&childId=${c.id}`)).data;
  const target = el.eligible.find((x) => x.seat_status !== 'full') || el.alternatives[0];
  await call(tk, 'PATCH', `/family/applications/${d.id}`, { preferences: [target.id], transport_mode: 'dropoff', declarations: true, exceptional_reason: 'medical' });
  await fillChecklist(tk, d.id, c.id);
  return call(tk, 'POST', `/family/applications/${d.id}/submit`);
}
await setRule('exceptional_transfer_approver', 'school');
const e1 = await exceptional(excCands[0]);
ok(e1.data.exceptional === 1 && e1.data.status !== 'escalated', `BR-14 "school decides": goes straight to the school (${e1.data.status})`, e1.data);
await setRule('exceptional_transfer_approver', 'ministry_admin');
const e2 = await exceptional(excCands[1]);
ok(e2.data.status === 'escalated' && e2.data.escalation_reason === 'exceptional_transfer', 'BR-14 "Ministry Administrator": escalated for approval', e2.data);
ok((await call(CO, 'POST', `/applications/${e2.data.id}/cluster-approve`, {})).status === 403, 'BR-14 cluster officer can no longer approve it');
const e2a = await call(hessa, 'POST', `/applications/${e2.data.id}/cluster-approve`, {});
ok(e2a.data.status === 'submitted' || e2a.data.status === 'passed', 'BR-14 Ministry Administrator approves; the school receives it', e2a.data);
ok((await call(hessa, 'GET', '/admin/audit?action=setting.changed')).data.filter((a) => RULES.includes(a.entity_id)).length >= 6, 'every rule change is in the audit log');
for (const k of RULES) await setRule(k, saved[k]);

console.log("A13 – the Ministry's own capacity, catchment, document list, leaving reason and academic year");
const AY = lookups.admission_ay.code;
// a capacity value
const capOf = async () => (await call(hessa, 'GET', `/schools/${sid('SHJ-S02')}/capacity`)).data.grades.find((g) => g.grade === 'KG1');
const c0 = await capOf();
const nSec = c0.sections.length, max0 = c0.sections[0].capacity;
ok((await call(viewer, 'PUT', '/admin/capacity', { schoolId: sid('SHJ-S02'), ay: AY, grade: 'KG1', sections: nSec, maxStudents: max0 + 5, offered: true })).status === 403, 'viewer cannot change capacity');
await call(hessa, 'PUT', '/admin/capacity', { schoolId: sid('SHJ-S02'), ay: AY, grade: 'KG1', sections: nSec, maxStudents: max0 + 5, offered: true });
const c1 = await capOf();
ok(c1.capacity === c0.capacity + 5 * nSec && c1.available === c0.available + 5 * nSec, `capacity value: Al Nahda KG KG1 ${c0.capacity} → ${c1.capacity} seats, available follows`);
await call(hessa, 'PUT', '/admin/capacity', { schoolId: sid('SHJ-S02'), ay: AY, grade: 'KG1', sections: nSec, maxStudents: max0, offered: true });

// a catchment boundary
const s02 = (await call(hessa, 'GET', '/admin/catchments')).data.find((c) => c.school_id === sid('SHJ-S02'));
const far = { type: 'Polygon', coordinates: [[[55.60, 25.10], [55.62, 25.10], [55.62, 25.12], [55.60, 25.12], [55.60, 25.10]]] };
await call(hessa, 'PUT', `/admin/catchments/${sid('SHJ-S02')}`, { geojson: far });
const elC = (await call(F, 'GET', '/family/eligible-schools?grade=KG1')).data.eligible.map((x) => x.code);
ok(!elC.includes('SHJ-S02') && elC.length === 2, 'catchment boundary: a home the new boundary no longer covers stops seeing that school');
await call(hessa, 'PUT', `/admin/catchments/${sid('SHJ-S02')}`, { geojson: s02.geojson });

// a document list
const nd = await call(hessa, 'POST', '/admin/lists', { list_type: 'doc_type', code: 'medical_fitness', label_en: 'Medical fitness certificate', label_ar: 'شهادة اللياقة الطبية', matrix: { new: 'R', private: 'R', other_emirate: 'R', abroad: 'R', renewal: '-', renewal_moved: 'R' } });
const ck2 = (await call(ahmed, 'GET', `/family/applications/${rn.data.app.id}`)).data.checklist;
ok(nd.status === 200 && ck2.some((x) => x.doc_type === 'medical_fitness' && x.needed), 'document list: a new document type is required on new checklists');

// a leaving reason
await call(hessa, 'POST', '/admin/lists', { list_type: 'leave_reason', code: 'specialist_centre', label_en: 'Moved to a specialist centre', label_ar: 'الانتقال إلى مركز متخصص' });
await call(hessa, 'POST', '/admin/lists', { list_type: 'leave_subreason', code: 'sc_health', parent_code: 'specialist_centre', label_en: 'Health needs', label_ar: 'احتياجات صحية' });
const lvC = excCands[0];
ok((await call(lvC.tk, 'POST', `/family/children/${lvC.c.id}/leave`, { reason: 'not_a_reason', subreason: 'x', leaveDate: today })).status === 400, 'a reason that is not in the list is refused');
const lv = await call(lvC.tk, 'POST', `/family/children/${lvC.c.id}/leave`, { reason: 'specialist_centre', subreason: 'sc_health', leaveDate: today });
const regL = await staff((p) => p.role === 'registrar' && p.school_code === lookups.schools.find((x) => x.id === lvC.c.enrolment.school_id).code);
const lr2 = (await call(regL, 'GET', '/leavers?view=requests')).data.find((x) => x.child_id === lvC.c.id);
const cf2 = await call(regL, 'POST', `/leavers/${lr2.id}/confirm`, {});
const ir7b = (await call(viewer, 'GET', `/reports/IR-07?from=${today}&to=${today}`)).data.rows;
ok(lv.status === 200 && cf2.data.status === 'left' && ir7b.some((r) => r.subreason === 'Health needs'), 'leaving reason: the new reason is usable and appears in IR-07');

// an academic year (AD-01)
ok((await call(viewer, 'POST', '/admin/academic-years', { code: '2028-29', start_date: '2028-08-21', end_date: '2029-06-29' })).status === 403, 'viewer cannot add an academic year');
const ay29 = await call(hessa, 'POST', '/admin/academic-years', { code: '2028-29', start_date: '2028-08-21', end_date: '2029-06-29', copy_capacity_from: AY });
const cap29 = (await call(hessa, 'GET', `/schools/${sid('SHJ-S01')}/capacity?ay=2028-29`)).data;
const win29 = (await call(hessa, 'GET', '/admin/windows')).data.windows.filter((w) => w.ay === '2028-29');
ok(ay29.status === 200 && ay29.data.sections_copied > 0 && cap29.capacity > 0 && win29.length === 3, `academic year 2028-29 added with its 3 windows and ${ay29.data?.sections_copied} sections copied`);
ok((await call(hessa, 'POST', '/admin/academic-years', { code: '2028-30', start_date: '2028-08-21', end_date: '2029-06-29' })).status === 400, 'a malformed academic year is refused');
ok((await call(hessa, 'DELETE', `/admin/academic-years/${lookups.current_ay.code}`)).status === 409, 'a year in use cannot be deleted');
ok((await call(hessa, 'DELETE', '/admin/academic-years/2028-29')).status === 200, 'an unused year can be deleted');
const acts = (await call(hessa, 'GET', '/admin/audit?limit=300')).data.map((a) => a.action);
ok(['capacity.grade_config', 'catchment.updated', 'list.item_added', 'academic_year.created', 'academic_year.deleted'].every((a) => acts.includes(a)), 'an audit entry for each change');

console.log('Student directory');
const R4s = await staff((p) => p.role === 'registrar' && p.school_code === 'SHJ-S04');
const sd = (await call(R4s, 'GET', '/school/students?q=Omar%20Al%20Hashimi')).data;
const omarRow = sd.rows?.find((r) => r.full_name_en === 'Omar Al Hashimi');
ok(omarRow && omarRow.grade === 'G3' && omarRow.next_year, `registrar finds Omar Al Hashimi (G3, next year: ${omarRow?.next_year})`, sd);
const sdet = await call(R4s, 'GET', `/school/students/${omarRow.id}`);
ok(sdet.status === 200 && sdet.data.guardians.some((g) => g.full_name_en === 'Ahmed Al Hashimi') && sdet.data.history.length >= 1, 'student detail shows guardians and enrolment history');
ok((await call(R1, 'GET', `/school/students/${omarRow.id}`)).status === 403, "another school's registrar cannot open the student");
ok((await call(R1, 'GET', '/school/students?q=Omar%20Al%20Hashimi')).data.rows.length === 0, "another school's registrar does not find the student");
ok((await call(CO, 'GET', `/school/students/${omarRow.id}`)).status === 200, 'cluster officer can open students in the cluster');
ok((await call(ahmed, 'GET', '/school/students')).status === 403, 'parents cannot use the student directory');
const joinRow = (await call(R1, 'GET', '/school/students?q=Mariam%20Al%20Mansoori')).data.rows?.find((r) => r.full_name_en === 'Mariam Al Mansoori');
ok(joinRow?.next_year === 'joining' && joinRow.grade === 'KG1', `a child accepted for next year appears as joining (${joinRow?.next_year} ${joinRow?.grade})`);
const joinDet = (await call(R1, 'GET', `/school/students/${joinRow?.id}`)).data;
ok(joinDet.next_year === 'joining' && !joinDet.current && joinDet.next?.grade === 'KG1', 'their record shows no placement this year and the place next year');

console.log('Annual roll-over and renewal into the next academic year');
const NEXT = '2028-29';
await call(hessa, 'POST', '/admin/academic-years', { code: NEXT, start_date: '2028-08-21', end_date: '2029-06-29', copy_capacity_from: AY });
const pv = (await call(hessa, 'GET', `/admin/academic-years/${NEXT}/rollover`)).data;
ok(pv.source === AY && pv.totals.roll > 1000 && pv.totals.new_school > 0, `preview from ${pv.source}: ${pv.totals.roll} to hold, ${pv.totals.new_school} need a new school, ${pv.totals.graduating} graduating`);
ok((await call(viewer, 'POST', `/admin/academic-years/${NEXT}/rollover`)).status === 403, 'viewer cannot run the roll-over');
const rw = (await call(hessa, 'GET', '/admin/windows')).data.windows.find((w) => w.ay === NEXT && w.type === 'renewal');
await call(hessa, 'PUT', `/admin/windows/${rw.id}`, { open_date: today, close_date: '2028-12-31' });
await call(hessa, 'POST', `/admin/academic-years/${NEXT}/role`, { role: 'admission' });
const ro1 = (await call(hessa, 'POST', `/admin/academic-years/${NEXT}/rollover`)).data;
ok(ro1.created === pv.totals.roll && ro1.notified > 0, `roll-over held ${ro1.created} seats for renewal and sent ${ro1.notified} renewal notifications`);
const ro2 = (await call(hessa, 'POST', `/admin/academic-years/${NEXT}/rollover`)).data;
ok(ro2.created === 0 && ro2.totals.already >= ro1.created, 'running the roll-over again adds nothing');
const mar = (await call(F, 'GET', '/family')).data.children.find((c) => c.id === mariam);
ok(mar.next_year?.status === 'pending_renewal' && mar.next_year.grade === 'KG2' && mar.can_renew, `Mariam has a KG2 seat held for ${NEXT} and can renew`);
ok((await call(F, 'GET', '/notifications')).data.some((n) => n.template === 'renewal_window_open'), 'parent notified that the renewal window is open');
const rnw = await call(F, 'POST', `/family/children/${mariam}/renew`, { addressUnchanged: true, contactConfirmed: true, transportMode: 'dropoff' });
ok(rnw.data.app?.status === 'accepted' && rnw.data.app.ay === NEXT && rnw.data.app.grade === 'KG2', `renewal for ${NEXT} confirmed`);
ok((await call(hessa, 'GET', '/admin/audit?action=rollover.completed')).data.length >= 1, 'roll-over recorded in the audit log');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll scenario checks passed');
process.exit(failures ? 1 : 0);
