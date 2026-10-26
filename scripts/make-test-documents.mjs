// Generates synthetic documents for testing uploads with the spare test children.
//   npm run test-docs        → test-documents/ (re-run to refresh dated documents, e.g. the utility bill)
// Every file is clearly watermarked as a synthetic test document; issuers are generic placeholders.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SPARE_CHILDREN } from '../server/seed/reference.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'test-documents');
const today = new Date();
const day = (offsetDays) => new Date(today.getTime() + offsetDays * 86400000).toISOString().slice(0, 10);
const fmt = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/* ---------------- minimal PDF writer (A4, Helvetica, ASCII text) ---------------- */
const esc = (s) => String(s).normalize('NFKD').replace(/[^\x20-\x7E]/g, (c) => ({ '–': '-', '—': '-', '’': "'", '·': '-' }[c] ?? '')).replace(/[\\()]/g, '\\$&');
function pdf(title, subtitle, rows, notes = []) {
  const ops = [];
  // watermark
  ops.push('q 0.88 g BT /F2 40 Tf 0.766 0.643 -0.643 0.766 85 230 Tm (SYNTHETIC TEST DOCUMENT) Tj ET Q');
  ops.push('q 0.88 g BT /F2 26 Tf 0.766 0.643 -0.643 0.766 140 180 Tm (NOT VALID - NO REAL PERSON) Tj ET Q');
  // header band
  ops.push('q 0.71 0.54 0.21 rg 40 760 515 46 re f Q');
  ops.push(`BT 1 g /F2 17 Tf 52 786 Td (${esc(title)}) Tj ET`);
  ops.push(`BT 1 g /F1 10 Tf 52 769 Td (${esc(subtitle)}) Tj ET`);
  // field rows
  let y = 725;
  for (const [k, v] of rows) {
    if (k === '---') { ops.push(`q 0.8 G 0.6 w 52 ${y + 6} m 543 ${y + 6} l S Q`); y -= 14; continue; }
    if (k === '#') { ops.push(`BT 0.2 g /F2 12 Tf 52 ${y} Td (${esc(v)}) Tj ET`); y -= 22; continue; }
    ops.push(`BT 0.37 g /F1 10.5 Tf 52 ${y} Td (${esc(k)}) Tj ET`);
    ops.push(`BT 0.1 g /F2 10.5 Tf 220 ${y} Td (${esc(v)}) Tj ET`);
    y -= 20;
  }
  y -= 10;
  for (const n of notes) { ops.push(`BT 0.37 g /F1 9 Tf 52 ${y} Td (${esc(n)}) Tj ET`); y -= 14; }
  ops.push('BT 0.5 g /F1 8 Tf 52 40 Td (Generated for the MoE School Registration Portal proof of concept. Synthetic data - not issued by any authority.) Tj ET');
  const content = ops.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/* ---------------- minimal PNG writer: a passport-style placeholder portrait ---------------- */
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function portrait(gender, seed) {
  const W = 300, H = 400, px = Buffer.alloc((W * 3 + 1) * H);
  const bg = [[221, 233, 243], [236, 229, 214], [226, 240, 228]][seed % 3];
  const skin = [[224, 190, 160], [198, 152, 118], [168, 122, 92]][seed % 3];
  const hair = [[45, 35, 30], [70, 50, 35], [25, 25, 28]][(seed + 1) % 3];
  const shirt = gender === 'F' ? [146, 114, 42] : [62, 64, 70];
  for (let y = 0; y < H; y++) {
    px[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      let c = bg;
      const head = (x - 150) ** 2 / 64 ** 2 + (y - 165) ** 2 / 78 ** 2 <= 1;
      const hairTop = (x - 150) ** 2 / 74 ** 2 + (y - 150) ** 2 / 86 ** 2 <= 1 && y < 150;
      const longHair = gender === 'F' && (x - 150) ** 2 / 82 ** 2 + (y - 190) ** 2 / 110 ** 2 <= 1 && y > 130;
      const body = y > 262 && (x - 150) ** 2 / 128 ** 2 + (y - 400) ** 2 / 150 ** 2 <= 1;
      if (longHair) c = hair;
      if (body) c = shirt;
      if (head) c = skin;
      if (hairTop) c = hair;
      if (x < 6 || x >= W - 6 || y < 6 || y >= H - 6) c = [182, 138, 53];
      const o = y * (W * 3 + 1) + 1 + x * 3;
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(px)), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------------- what each child needs ---------------- */
const NATION = { AE: 'United Arab Emirates', JO: 'Jordan', EG: 'Egypt', PK: 'Pakistan' };
const BIRTHPLACE = { AE: 'Sharjah, United Arab Emirates', JO: 'Amman, Jordan', EG: 'Cairo, Egypt', PK: 'Karachi, Pakistan' };
const pathwayOf = (note) => (note.includes('private') ? 'private' : note.includes('abroad') ? 'abroad' : note.includes('another emirate') ? 'other_emirate' : 'new');
const NEEDS = {
  new: ['child_eid', 'birth_certificate', 'child_photo', 'vaccination'],
  private: ['child_eid', 'birth_certificate', 'child_photo', 'vaccination', 'school_reports', 'transfer_certificate'],
  other_emirate: ['child_eid'],
  abroad: ['child_eid', 'birth_certificate', 'child_photo', 'vaccination', 'school_reports', 'transfer_certificate', 'equivalency'],
};
const GRADES = ['KG1', 'KG2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9'];

function childDocs(c, i) {
  const [eid, name, , dob, gender, nat, note] = c;
  const pathway = pathwayOf(note);
  const father = name.split(' ').slice(1).join(' ');
  const lastDone = (note.match(/last completed G(\d+)/) || [])[1];
  const passportNo = `S${String(7300000 + i * 1371).slice(0, 7)}`;
  const docs = [...NEEDS[pathway]];
  if (nat !== 'AE') docs.splice(1, 0, 'child_passport');
  if (note.includes('determination')) docs.push('sod_reports');
  const files = {};
  const base = [['Full name', name], ['Date of birth', fmt(dob)], ['Gender', gender === 'M' ? 'Male' : 'Female'], ['Nationality', NATION[nat]]];
  for (const d of docs) {
    if (d === 'child_eid') files['child-emirates-id.pdf'] = pdf('Emirates ID - SAMPLE', 'Identity card (synthetic test copy)', [['ID number', eid], ...base, ['Card expiry', fmt('2030-06-30')]], ['Matches the simulated identity register used by the portal.']);
    if (d === 'child_passport') files['child-passport.pdf'] = pdf('Passport - SAMPLE', 'Passport data page (synthetic test copy)', [['Passport number', passportNo], ...base, ['Place of birth', BIRTHPLACE[nat]], ['Date of issue', fmt('2024-02-01')], ['Date of expiry', fmt('2029-01-31')]], [`Enter passport number ${passportNo} when adding the child.`]);
    if (d === 'birth_certificate') files['birth-certificate.pdf'] = pdf('Birth Certificate - SAMPLE', 'Certificate of live birth (synthetic test copy)', [['Child', name], ['Date of birth', fmt(dob)], ['Place of birth', BIRTHPLACE[nat]], ['Gender', gender === 'M' ? 'Male' : 'Female'], ['Father', father], ['Certificate number', `BC-${dob.slice(0, 4)}-${String(40000 + i * 77)}`]]);
    if (d === 'child_photo') {
      const png = portrait(gender, i);
      files['child-photo.png'] = png;
      files.__jpgFrom = 'child-photo.png';
    }
    if (d === 'vaccination') files['vaccination-record.pdf'] = pdf('Vaccination Record - SAMPLE', 'Child immunisation card (synthetic test copy)', [['Child', name], ['Date of birth', fmt(dob)], ['---'], ['#', 'Vaccines given'], ['BCG, Hepatitis B', 'At birth'], ['DTaP-IPV-Hib-HepB', '2, 4 and 6 months'], ['MMR', '12 months and 18 months'], ['Varicella', '12 months'], ['DTaP-IPV booster', '4-5 years']]);
    if (d === 'school_reports') {
      const done = Number(lastDone);
      const y2 = today.getUTCFullYear() - (today.getUTCMonth() < 8 ? 1 : 0);
      files['school-reports-last-2-years.pdf'] = pdf('School Reports - SAMPLE', `${pathway === 'abroad' ? 'Sample International School, ' + BIRTHPLACE[nat].split(',')[1].trim() : 'Sample Private School, Sharjah'} (synthetic)`, [
        ['Student', name], ['---'],
        ['#', `${GRADES[done + 1]} - academic year ${y2 - 1}-${String(y2 % 100).padStart(2, '0')}`],
        ['Arabic / English / Maths', 'Very good / Excellent / Very good'], ['Science / Social studies', 'Good / Very good'], ['Attendance', '96%'], ['---'],
        ['#', `${GRADES[done]} - academic year ${y2 - 2}-${String((y2 - 1) % 100).padStart(2, '0')}`],
        ['Arabic / English / Maths', 'Good / Very good / Excellent'], ['Science / Social studies', 'Very good / Good'], ['Attendance', '94%'],
      ]);
    }
    if (d === 'transfer_certificate') files['transfer-certificate.pdf'] = pdf(`Transfer Certificate - SAMPLE${pathway === 'abroad' ? ' (attested)' : ''}`, 'School leaving certificate (synthetic test copy)', [['Student', name], ['Date of birth', fmt(dob)], ['Last grade completed', GRADES[Number(lastDone) + 1]], ['Date of leaving', fmt(day(-30))], ['Conduct', 'Good'], ['Fees', 'No dues outstanding'], ...(pathway === 'abroad' ? [['Attestation', 'Attested - sample stamp (synthetic)']] : [])]);
    if (d === 'equivalency') files['equivalency-certificate.pdf'] = pdf('Equivalency Certificate - SAMPLE', 'Academic equivalency decision (synthetic test copy)', [['Student', name], ['Studied in', NATION[nat]], ['Completed', `Grade ${lastDone} (foreign curriculum)`], ['Equivalent to', `UAE Grade ${lastDone}`], ['Eligible to join', `UAE Grade ${Number(lastDone) + 1}`], ['Decision number', `EQ-${today.getUTCFullYear()}-${3100 + i}`]]);
    if (d === 'sod_reports') files['student-of-determination-reports.pdf'] = pdf('Student of Determination Report - SAMPLE', 'Specialist assessment summary (synthetic test copy)', [['Child', name], ['Date of birth', fmt(dob)], ['Assessment date', fmt(day(-60))], ['Summary', 'Speech and language support recommended'], ['Recommended support', 'Learning support assistant; speech therapy weekly'], ['Assessor', 'Sample Child Development Centre']]);
  }
  return { pathway, docs, files };
}

/* ---------------- write everything ---------------- */
// start clean, keeping the hand-written guide (README.md)
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f !== 'README.md') fs.rmSync(path.join(OUT, f), { recursive: true, force: true });
const sips = (() => { try { execFileSync('which', ['sips'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const summary = [];
SPARE_CHILDREN.forEach((c, i) => {
  const folder = path.join(OUT, `${c[0]}_${c[1].replace(/\s+/g, '-')}`);
  fs.mkdirSync(folder, { recursive: true });
  const { pathway, files } = childDocs(c, i);
  for (const [f, buf] of Object.entries(files)) if (!f.startsWith('__')) fs.writeFileSync(path.join(folder, f), buf);
  // also provide the photo as JPG (macOS sips) so both image formats can be tested
  if (files.__jpgFrom && sips) execFileSync('sips', ['-s', 'format', 'jpeg', path.join(folder, files.__jpgFrom), '--out', path.join(folder, 'child-photo.jpg')], { stdio: 'ignore' });
  summary.push({ c, pathway, files: fs.readdirSync(folder).sort() });
});

// documents that belong to the family (shared by all children of a parent)
const fam = path.join(OUT, '_family-and-residence');
fs.mkdirSync(fam);
const billDate = day(-20), oldBill = day(-150);
const write = (dir, f, buf) => fs.writeFileSync(path.join(dir, f), buf);
write(fam, 'guardian-emirates-id.pdf', pdf('Emirates ID - SAMPLE', 'Guardian identity card (synthetic test copy)', [['Holder', 'Test guardian (any test parent)'], ['ID number', 'Use the signed-in parent\'s ID'], ['Card expiry', fmt('2029-12-31')]], ['Upload for each guardian; the portal does not read the content of test files.']));
write(fam, 'guardian-passport.pdf', pdf('Passport - SAMPLE', 'Guardian passport data page (synthetic test copy) - for non-UAE guardians', [['Holder', 'Test guardian'], ['Passport number', 'G4410982'], ['Date of expiry', fmt('2031-03-31')]]));
write(fam, 'tenancy-contract.pdf', pdf('Tenancy Contract - SAMPLE', 'Residential tenancy contract (synthetic test copy)', [['Contract number', 'TC-2026-104523'], ['Tenant', 'Test guardian'], ['Property', 'Apartment 1204, Sample Tower, Al Nahda, Sharjah'], ['Start date', fmt('2026-01-01')], ['End date', fmt('2027-12-31')], ['Annual rent', 'AED 48,000']], ['Enter contract number TC-2026-104523 and expiry 31 Dec 2027 when uploading.']));
write(fam, 'utility-bill.pdf', pdf('Utility Bill - SAMPLE', 'Electricity and water bill (synthetic test copy)', [['Account number', 'UTIL-4418290'], ['Customer', 'Test guardian'], ['Premises', 'Apartment 1204, Sample Tower, Al Nahda, Sharjah'], ['Bill date', fmt(billDate)], ['Billing period', `${fmt(day(-50))} - ${fmt(day(-21))}`], ['Amount due', 'AED 612.40']], [`Enter account number UTIL-4418290 and issue date ${billDate} when uploading.`, 'Must be issued in the last 3 months (rule BR-10) - re-run "npm run test-docs" for a fresh date.']));
write(fam, 'custody-order.pdf', pdf('Custody Order - SAMPLE', 'Court custody / guardianship order (synthetic test copy)', [['Case number', 'CUST-2025-0815'], ['Custodian', 'Test guardian'], ['Children', 'As listed in the family account'], ['Decision date', fmt('2025-08-15')]], ['Use when the family is marked as sole custody (Profile).']));
write(fam, 'host-residence-documents.pdf', pdf('Host Residence Letter - SAMPLE', 'Living with relatives / employer housing (synthetic test copy)', [['Host', 'Sample relative / employer'], ['Host contract number', 'TC-2025-998812'], ['Address', 'Villa 18, Al Ramtha, Sharjah'], ['Letter date', fmt(day(-10))]], ['Use with the "living with relatives / employer housing" residence route (sent to cluster review).']));
write(fam, 'exceptional-transfer-support-letter.pdf', pdf('Supporting Letter - SAMPLE', 'Medical letter supporting an exceptional transfer (synthetic test copy)', [['Patient', 'The child being transferred'], ['Recommendation', 'Transfer to a school nearer home for treatment schedule'], ['Issued by', 'Sample Medical Centre'], ['Date', fmt(day(-7))]], ['Use for transfers outside the transfer window (PP-22).']));

// files that should be refused, to test validation
const bad = path.join(OUT, '_invalid-for-testing');
fs.mkdirSync(bad);
write(bad, 'old-utility-bill.pdf', pdf('Utility Bill - SAMPLE (too old)', 'Electricity and water bill (synthetic test copy)', [['Account number', 'UTIL-4418290'], ['Bill date', fmt(oldBill)]], [`Enter issue date ${oldBill}: the portal must refuse it (older than 3 months, BR-10).`]));
write(bad, 'wrong-format.docx', Buffer.from('Not an accepted format: only PDF, JPG and PNG are allowed.\n'));
// over 5 MB – generated, not committed (see .gitignore)
const big = pdf('Oversized file - SAMPLE', 'Larger than the 5 MB limit', [['Size', 'about 6 MB']]).toString('latin1').replace('%%EOF', '%' + 'x'.repeat(6 * 1024 * 1024) + '\n%%EOF');
write(bad, 'oversized-6mb.pdf', Buffer.from(big, 'latin1'));

console.log(`Test documents written to ${path.relative(root, OUT)}/`);
for (const s of summary) console.log(`  ${s.c[0]}  ${s.c[1].padEnd(25)} ${s.pathway.padEnd(14)} ${s.files.join(', ')}`);
console.log(`  utility bill dated ${billDate} (valid until about ${day(70)})`);
