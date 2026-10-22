// Localised rendering of report cells (IR-01 .. IR-10), shared by the dashboard and the reports page.
const PCT = new Set(['utilisation', 'change_pct', 'within_sla_pct']);
const NUM = new Set(['submitted', 'offered', 'accepted', 'rejected', 'pending', 'withdrawn', 'applications', 'this_year', 'last_year', 'change', 'capacity', 'enrolled', 'held', 'bus_held', 'available',
  'applications_in_catchment', 'first_preference', 'available_seats', 'demand_ratio', 'unmet_demand', 'leavers', 'male', 'female', 'new_registrations', 'transfers_in', 'transfers_out',
  'net_change', 'decided', 'within_sla', 'avg_decision_days', 'open', 'overdue', 'requests', 'confirmed', 'waitlisted', 'level', ...PCT]);

export const isNum = (col) => NUM.has(col);

export function makeCell({ t, lang, fmtNum, fmtDate, fmtDateTime }) {
  const local = (row, col) => (lang === 'ar' && row[`${col}_ar`] != null ? row[`${col}_ar`] : row[col]);
  const grade = (g) => (g === 'ALL' ? t('ins.whole_school') : t(`grade.${g}`, { default: g }));
  return (row, col) => {
    const v = row[col];
    if (v === null || v === undefined || v === '') return '—';
    switch (col) {
      case 'school': case 'route': case 'reason': case 'subreason': return local(row, col);
      case 'pathway': return t(`pathway.${v}`, { default: v });
      case 'type': return t(`type.${v}`, { default: v });
      case 'cycle': return t(`cycle.${v}`, { default: v });
      case 'grade': return grade(v);
      case 'section': {
        const [g, s] = String(v).split('-');
        return s ? `${grade(g)} – ${s}` : v;
      }
      case 'level': return `${fmtNum(v)}%`;
      case 'reached_at': case 'cleared_at': case 'submitted_at': return fmtDateTime(v);
      case 'sla_due_at': return fmtDate(String(v).slice(0, 10));
      case 'change': return `${v > 0 ? '+' : ''}${fmtNum(v)}`;
      default:
        if (PCT.has(col)) return `${col === 'change_pct' && v > 0 ? '+' : ''}${fmtNum(v, 1)}%`;
        if (typeof v === 'number') return fmtNum(v, 2);
        return v;
    }
  };
}
