// Transport coordinator: route capacity, bus seat requests and waiting lists (PP-15, BR-09, IR-10).
import { useState, useMemo } from 'react';
import { api, qs } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAsync, useAction, PageHead, Loader, Card, DataTable, StatusBadge, CapacityBar, Modal, Field } from '../../components/ui.jsx';
import MapView from '../../components/MapView.jsx';

export default function Transport() {
  const { t, L, fmtDate, fmtNum } = useI18n();
  const { me } = useAuth();
  const canEdit = me.role === 'transport';
  const routes = useAsync(() => api.get('/transport/routes'), []);
  const [f, setF] = useState({ route: '', status: '' });
  const reqs = useAsync(() => api.get(`/transport/requests${qs(f)}`), [f.route, f.status]);
  const [run, busy] = useAction();
  const [edit, setEdit] = useState(null);

  const stops = useMemo(() => (routes.data || []).flatMap((r) => r.stops.filter((s) => !f.route || r.id === Number(f.route)).map((s) => ({ lat: s.lat, lng: s.lng, label: `${r.code} · ${L(s)}` }))), [routes.data, f.route, L]);
  const schools = useMemo(() => {
    const m = new Map();
    for (const r of routes.data || []) if (!f.route || r.id === Number(f.route)) for (const s of r.schools) m.set(s.id, s);
    return [...m.values()];
  }, [routes.data, f.route]);
  const { lookups } = useAuth();

  const confirm = (id) => run(() => api.post(`/transport/seats/${id}/confirm`), t('bo.tr.confirmed')).then(() => { reqs.reload(); routes.reload(); }).catch(() => {});

  return (
    <>
      <PageHead title={t('nav.transport')} sub={t('bo.tr.sub')} reqs={['PP-15', 'BR-09', 'IR-10']} />
      {!canEdit && <div className="alert info small mb">{t('common.read_only')}</div>}
      <Loader state={routes}>
        {(rows) => (
          <div className="grid c2" style={{ alignItems: 'start' }}>
            <Card title={t('bo.tr.routes')}>
              <DataTable rows={rows} onRowClick={(r) => setF((x) => ({ ...x, route: x.route === String(r.id) ? '' : String(r.id) }))} columns={[
                { key: 'code', label: t('col.route'), render: (r) => <><b>{r.code}</b> {L(r)}{f.route === String(r.id) && <span className="badge gold">✓</span>}<div className="small muted">{r.schools.map((s) => L(s)).join(' · ')}</div></> },
                { key: 'capacity', label: t('col.capacity'), num: true, render: (r) => <>{r.capacity}{canEdit && <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); setEdit({ id: r.id, code: r.code, capacity: r.capacity }); }}>✎</button>}</> },
                { key: 'confirmed', label: t('col.confirmed'), num: true },
                { key: 'held', label: t('bo.tr.held'), num: true },
                { key: 'waitlisted', label: t('col.waitlisted'), num: true, render: (r) => r.waitlisted ? <span className="badge amber">{r.waitlisted}</span> : 0 },
                { key: 'u', label: t('col.utilisation'), render: (r) => { const pct = Math.round(((r.held + r.confirmed) / r.capacity) * 1000) / 10; return <div style={{ minWidth: 90 }}><CapacityBar pct={pct} /><span className="small">{fmtNum(pct, 1)}%</span></div>; } },
              ]} />
            </Card>
            <Card title={t('bo.tr.map')}>
              <MapView stops={stops} schools={schools.map((s) => { const x = lookups.schools.find((y) => y.id === s.id); return { lat: x.lat, lng: x.lng, short: x.code.slice(-3), label: L(x) }; })} fitTo="all" />
            </Card>
          </div>
        )}
      </Loader>
      <Card title={t('bo.tr.requests')} className="mt">
        <div className="row mb">
          <select style={{ width: 'auto' }} value={f.route} onChange={(e) => setF((x) => ({ ...x, route: e.target.value }))}>
            <option value="">{t('bo.tr.all_routes')}</option>{(routes.data || []).map((r) => <option key={r.id} value={r.id}>{r.code} · {L(r)}</option>)}
          </select>
          <select style={{ width: 'auto' }} value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))}>
            <option value="">{t('bo.tr.active_requests')}</option>{['held', 'confirmed', 'waitlisted', 'released'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
        </div>
        <Loader state={reqs}>
          {(rows) => (
            <DataTable rows={rows} maxHeight="55vh" columns={[
              { key: 'route', label: t('col.route'), render: (r) => <b>{r.route_code}</b> },
              { key: 'stop', label: t('bo.tr.stop'), render: (r) => L(r, 'stop') },
              { key: 'child', label: t('bo.child'), render: (r) => L(r, 'child') },
              { key: 'app', label: t('col.ref'), render: (r) => <span className="mono small">{r.ref || t('bo.tr.current_student')}</span> },
              { key: 'school', label: t('common.school'), render: (r) => <span className="small">{L(r, 'school') || '—'}</span> },
              { key: 'app_status', label: t('bo.tr.app_status'), render: (r) => r.app_status ? <StatusBadge status={r.app_status} /> : '—' },
              { key: 'status', label: t('bo.tr.seat'), render: (r) => <StatusBadge status={r.status} /> },
              { key: 'at', label: t('common.date'), render: (r) => fmtDate(r.created_at) },
              ...(canEdit ? [{ key: 'act', label: '', render: (r) => ['held', 'waitlisted'].includes(r.status) && <button className="btn sm" disabled={busy} onClick={() => confirm(r.id)}>{r.status === 'waitlisted' ? t('bo.tr.promote') : t('common.confirm')}</button> }] : []),
            ]} />
          )}
        </Loader>
      </Card>
      {edit && (
        <Modal title={`${t('bo.tr.edit_capacity')} – ${edit.code}`} onClose={() => setEdit(null)} footer={<button className="btn" disabled={busy || !(edit.capacity > 0)} onClick={() => run(() => api.put(`/transport/routes/${edit.id}`, { capacity: Number(edit.capacity) }), t('common.saved')).then(() => { setEdit(null); routes.reload(); }).catch(() => {})}>{t('common.save')}</button>}>
          <Field label={t('col.capacity')}><input type="number" min="1" value={edit.capacity} onChange={(e) => setEdit({ ...edit, capacity: e.target.value })} /></Field>
        </Modal>
      )}
    </>
  );
}
