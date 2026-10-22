// Excel export (section 4.4 / TR-04) with Arabic right-to-left sheets (TR-07).
import ExcelJS from 'exceljs';
import { dict } from './i18n.js';

export async function exportXlsx(res, { name, lang = 'en', columns, rows, totals, titleKey, subtitle }) {
  const t = dict(lang === 'ar' ? 'ar' : 'en');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MoE Registration Portal PoC';
  const ws = wb.addWorksheet((t[titleKey] || name).slice(0, 31), { views: [{ rightToLeft: lang === 'ar', state: 'frozen', ySplit: 3 }] });
  ws.addRow([t[titleKey] || name]).font = { bold: true, size: 14 };
  ws.addRow([subtitle || '']);
  const header = ws.addRow(columns.map((c) => t[`col.${c}`] || c));
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92722A' } }));
  // localised value: prefer the "<col>_ar" field when exporting in Arabic
  const val = (row, c) => {
    const v = lang === 'ar' && row[`${c}_ar`] != null ? row[`${c}_ar`] : row[c];
    if (v == null) return '';
    if (typeof v === 'string' && t[`val.${v}`]) return t[`val.${v}`];
    return v;
  };
  for (const row of rows) ws.addRow(columns.map((c) => val(row, c)));
  if (totals) {
    const tr = ws.addRow(columns.map((c, i) => (i === 0 ? t['col.total'] || 'Total' : totals[c] ?? '')));
    tr.font = { bold: true };
  }
  columns.forEach((c, i) => (ws.getColumn(i + 1).width = Math.min(48, Math.max(12, (t[`col.${c}`] || c).length + 4))));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${lang}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}
