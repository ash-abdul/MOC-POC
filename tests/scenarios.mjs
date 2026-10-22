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

console.log(failures ? `\n${failures} check(s) failed` : '\nAll scenario checks passed');
process.exit(failures ? 1 : 0);
