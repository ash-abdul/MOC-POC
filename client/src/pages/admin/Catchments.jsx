// CC-03 / CC-08: catchment boundaries drawn on screen or uploaded as GeoJSON.
import { useState, useMemo } from 'react';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { useAsync, useAction, PageHead, Loader, Card, Field, useToast, ReqTag } from '../../components/ui.jsx';
import MapView from '../../components/MapView.jsx';
import { useReadOnly, ReadOnlyNote } from '../../components/AdminBits.jsx';

const COLORS = ['#92722a', '#0a6aa8', '#3f8e4f', '#d0312d', '#6c4527', '#5f646d', '#cba344', '#20a1e0', '#7c5e24', '#1b1d21', '#b68a35', '#4b4f58'];

export default function Catchments() {
  const { t, L, fmtDateTime } = useI18n();
  const ro = useReadOnly();
  const toast = useToast();
  const st = useAsync(() => api.get('/admin/catchments'), []);
  const [sel, setSel] = useState(null);
  const [points, setPoints] = useState(null); // drawing mode when not null
  const [pending, setPending] = useState(null); // uploaded geometry not yet saved
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();

  const rows = st.data || [];
  const selected = rows.find((c) => c.school_id === sel);
  const polygons = useMemo(() => rows.map((c, i) => ({
    geojson: c.school_id === sel && pending ? pending : c.geojson, color: COLORS[i % COLORS.length], label: L(c),
    fill: c.school_id === sel ? 0.25 : sel ? 0.03 : 0.08, fit: !sel || c.school_id === sel,
  })), [rows, sel, pending, L]);

  const save = (geojson) => run(() => api.put(`/admin/catchments/${sel}`, { geojson, reason }), t('bo.catch.saved')).then(() => { setPoints(null); setPending(null); setReason(''); st.reload(); }).catch(() => {});

  const onFile = async (file) => {
    if (/\.(shp|zip)$/i.test(file.name)) return toast(t('bo.catch.no_shapefile'), 'error');
    try {
      const g = JSON.parse(await file.text());
      const type = g.type === 'Feature' ? g.geometry?.type : g.type;
      if (!['Polygon', 'MultiPolygon', 'FeatureCollection'].includes(type)) throw new Error();
      setPending(g.type === 'FeatureCollection' || g.type === 'Feature' ? g : g);
    } catch {
      toast(t('bo.catch.bad_file'), 'error');
    }
  };

  return (
    <>
      <PageHead title={t('nav.catchments')} sub={t('bo.catch.sub')} reqs={['CC-03', 'CC-08', 'BR-03']} />
      <ReadOnlyNote />
      <Loader state={st}>
        {() => (
          <div className="grid c3" style={{ alignItems: 'start' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <Card>
                {points && <div className="alert gold small mb">{t('bo.catch.drawing_hint', { n: points.length })}</div>}
                <MapView className="tall" polygons={polygons} fitTo="all"
                  schools={rows.map((c, i) => ({ lat: c.lat, lng: c.lng, short: c.code.slice(-3), label: L(c), highlight: c.school_id === sel }))}
                  drawing={points ? { points, onChange: setPoints } : null} />
              </Card>
            </div>
            <div className="stack">
              <Card title={t('bo.catch.schools')}>
                <div className="stack" style={{ maxHeight: 300, overflow: 'auto' }}>
                  {rows.map((c, i) => (
                    <button key={c.school_id} className={`btn ${sel === c.school_id ? '' : 'secondary'} sm`} style={{ justifyContent: 'flex-start', width: '100%' }} onClick={() => { setSel(c.school_id); setPoints(null); setPending(null); }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length], display: 'inline-block' }} /> {c.code} · {L(c)}
                    </button>
                  ))}
                </div>
              </Card>
              {selected && (
                <Card title={L(selected)}>
                  <p className="small muted">{t('bo.catch.updated', { at: fmtDateTime(selected.updated_at) })}</p>
                  {!ro && (
                    <div className="stack">
                      {!points ? (
                        <button className="btn secondary" onClick={() => { setPoints([]); setPending(null); }}>✎ {t('bo.catch.draw')}</button>
                      ) : (
                        <div className="row">
                          <button className="btn secondary sm" disabled={!points.length} onClick={() => setPoints(points.slice(0, -1))}>{t('bo.catch.undo')}</button>
                          <button className="btn secondary sm" onClick={() => setPoints([])}>{t('bo.catch.clear')}</button>
                          <button className="btn ghost sm" onClick={() => setPoints(null)}>{t('common.cancel')}</button>
                        </div>
                      )}
                      <Field label={t('bo.catch.upload')} hint={t('bo.catch.upload_hint')}>
                        <input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
                      </Field>
                      <div className="alert info small">{t('bo.catch.no_shapefile')}</div>
                      <Field label={t('common.reason')}><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
                      {points && <button className="btn" disabled={busy || points.length < 3} onClick={() => save({ type: 'Polygon', coordinates: [[...points, points[0]]] })}>{t('bo.catch.save_drawn')}</button>}
                      {pending && <button className="btn" disabled={busy} onClick={() => save(pending)}>{t('bo.catch.save_upload')}</button>}
                      <button className="btn ghost sm" onClick={() => {
                        const blob = new Blob([JSON.stringify({ type: 'Feature', properties: { school: selected.code }, geometry: selected.geojson }, null, 1)], { type: 'application/geo+json' });
                        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${selected.code}-catchment.geojson`; a.click();
                      }}>⬇ {t('bo.catch.download')}</button>
                      <p className="small muted">{t('bo.catch.immediate')} <ReqTag id="CC-08" /></p>
                    </div>
                  )}
                </Card>
              )}
            </div>
          </div>
        )}
      </Loader>
    </>
  );
}
