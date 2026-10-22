// Lightweight SVG bar chart (grouped bars), RTL aware.
// data: rows; x: category key; series: [{ key, label, color }]
import { useI18n } from '../i18n.jsx';

const COLORS = ['#92722a', '#1b1d21', '#20a1e0', '#3f8e4f', '#cba344', '#9ea2a9'];

export default function Bars({ data = [], x, xLabel, series = [], height = 240, valueSuffix = '', threshold }) {
  const { dir, fmtNum } = useI18n();
  if (!data.length) return null;
  const rows = dir === 'rtl' ? [...data].reverse() : data;
  const max = Math.max(1, ...rows.flatMap((r) => series.map((s) => Number(r[s.key]) || 0)), threshold || 0);
  const W = Math.max(480, rows.length * (series.length * 18 + 22)), H = height, padL = 44, padB = 54, padT = 22;
  const bw = (W - padL - 10) / rows.length;
  const barW = Math.min(26, (bw - 10) / series.length);
  const y = (v) => H - padB - ((H - padB - padT) * v) / max;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  return (
    <div style={{ overflowX: 'auto' }}>
      <div className="row small" style={{ marginBottom: 6 }}>
        {series.map((s, i) => <span key={s.key} className="row" style={{ gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: s.color || COLORS[i] }} />{s.label}</span>)}
      </div>
      <svg width={W} height={H} role="img" style={{ display: 'block' }}>
        {ticks.map((tv) => (
          <g key={tv}>
            <line x1={padL} x2={W - 6} y1={y(tv)} y2={y(tv)} stroke="#e1e3e5" />
            <text x={padL - 6} y={y(tv) + 4} fontSize="10" textAnchor="end" fill="#5f646d">{fmtNum(tv)}</text>
          </g>
        ))}
        {threshold && <line x1={padL} x2={W - 6} y1={y(threshold)} y2={y(threshold)} stroke="#d0312d" strokeDasharray="4 3" />}
        {rows.map((r, i) => {
          const gx = padL + i * bw + (bw - barW * series.length) / 2;
          const lab = String(xLabel ? xLabel(r) : r[x]);
          return (
            <g key={i}>
              {series.map((s, j) => {
                const v = Number(r[s.key]) || 0;
                return (
                  <rect key={s.key} x={gx + j * barW} y={y(v)} width={barW - 2} height={Math.max(0, H - padB - y(v))} rx="2" fill={s.color || COLORS[j]}>
                    <title>{`${lab} · ${s.label}: ${fmtNum(v, 1)}${valueSuffix}`}</title>
                  </rect>
                );
              })}
              <text x={padL + i * bw + bw / 2} y={H - padB + 14} fontSize="10" textAnchor="end" fill="#3e4046" transform={`rotate(-35 ${padL + i * bw + bw / 2} ${H - padB + 14})`}>
                {lab.length > 22 ? lab.slice(0, 21) + '…' : lab}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
