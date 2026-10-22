// Renewal (PP-19, A9): confirm address, contact details and transport. A changed address turns
// the renewal into a transfer that needs new residence proof.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { useAsync, Loader, PageHead, Card, Kv, useAction, SeatBadge, ReqTag } from '../../components/ui.jsx';
import { gradeLabel } from './shared.jsx';

export default function Renew() {
  const { id } = useParams();
  const { t, L, fmtDate } = useI18n();
  const nav = useNavigate();
  const st = useAsync(() => api.get('/family'), []);
  const [addr, setAddr] = useState(null);
  const [contact, setContact] = useState(false);
  const [mode, setMode] = useState('');
  const [done, setDone] = useState(null);
  const [run, busy] = useAction();

  return (
    <Loader state={st}>
      {(d) => {
        const c = d.children.find((x) => x.id === Number(id));
        if (!c) return <div className="alert error">{t('error.not_found')}</div>;
        const nx = c.next_year;
        const submit = () => run(async () => {
          const r = await api.post(`/family/children/${c.id}/renew`, { addressUnchanged: addr === 'same', contactConfirmed: contact, transportMode: mode });
          if (r.converted) nav(`/parent/home-location?next=/parent/apply/${r.app.id}`);
          else setDone(r.app);
        });
        if (done) {
          return (
            <Card>
              <div className="alert success"><div><b>{t('parent.renew.done_title')}</b><div className="small">{t('parent.renew.done_text', { name: L(c, 'full_name'), school: L(nx, 'school'), grade: gradeLabel(t, nx.grade), ref: done.ref })}</div></div></div>
              <Link className="btn mt" to="/parent">{t('parent.addchild.to_family')}</Link>
            </Card>
          );
        }
        return (
          <>
            <PageHead title={t('parent.renew.title', { name: L(c, 'full_name') })} sub={t('parent.renew.sub', { ay: d.admission_ay })} reqs={['PP-19']} />
            {!c.can_renew && <div className="alert warn mb">{d.windows.renewal.open ? t('parent.renew.not_available') : t('parent.renew.window_closed', { from: fmtDate(d.windows.renewal.window?.open_date), to: fmtDate(d.windows.renewal.window?.close_date) })}</div>}
            <Card title={t('parent.renew.place')}>
              <Kv items={[
                [t('parent.child.current'), c.enrolment ? `${L(c.enrolment, 'school')} · ${gradeLabel(t, c.enrolment.grade)}` : '—'],
                [t('parent.child.next_year'), nx ? `${L(nx, 'school')} · ${gradeLabel(t, nx.grade)} · ${d.admission_ay}` : '—'],
                [t('parent.renew.window'), d.windows.renewal.window ? `${fmtDate(d.windows.renewal.window.open_date)} – ${fmtDate(d.windows.renewal.window.close_date)}` : '—'],
              ]} />
            </Card>
            <Card title={`1. ${t('parent.renew.q_address')}`}>
              <p className="small muted">{t('parent.renew.current_address', { area: L(d.family, 'area') || '—', makani: d.family.makani || '—' })}</p>
              <label className="check"><input type="radio" name="addr" checked={addr === 'same'} onChange={() => setAddr('same')} /><span>{t('parent.renew.addr_same')}</span></label>
              <label className="check mt" style={{ marginTop: 6 }}><input type="radio" name="addr" checked={addr === 'moved'} onChange={() => setAddr('moved')} /><span>{t('parent.renew.addr_moved')}</span></label>
              {addr === 'moved' && <div className="alert warn small mt">{t('parent.renew.moved_note')} <ReqTag id="A9" /></div>}
            </Card>
            <Card title={`2. ${t('parent.renew.q_contact')}`}>
              {d.guardians.filter((g) => g.status === 'active').map((g) => (
                <div key={g.id} className="small" style={{ padding: '3px 0' }}><b>{L(g, 'full_name')}</b> · {g.mobile} · {g.email} · {t(`channel.${g.preferred_channel || 'email'}`)}</div>
              ))}
              <div className="small muted">{t('parent.renew.emergency')}: {d.family.emergency_name || '—'} {d.family.emergency_mobile || ''}</div>
              <label className="check mt"><input type="checkbox" checked={contact} onChange={(e) => setContact(e.target.checked)} /><span>{t('parent.renew.contact_ok')}</span></label>
              <Link className="small" to="/parent/profile">{t('parent.renew.update_contact')} →</Link>
            </Card>
            <Card title={`3. ${t('parent.renew.q_transport')}`}>
              {addr === 'moved' ? <p className="small muted">{t('parent.renew.transport_later')}</p> : (
                <TransportPick schoolId={nx?.school_id} mode={mode} setMode={setMode} />
              )}
            </Card>
            <div className="row mt">
              <button className="btn" disabled={!c.can_renew || !addr || !contact || (addr === 'same' && !mode) || busy} onClick={submit}>
                {addr === 'moved' ? t('parent.renew.convert') : t('parent.renew.confirm')}
              </button>
              <Link className="btn secondary" to="/parent">{t('common.cancel')}</Link>
            </div>
          </>
        );
      }}
    </Loader>
  );
}

function TransportPick({ schoolId, mode, setMode }) {
  const { t, L } = useI18n();
  const bus = useAsync(() => (schoolId ? api.get(`/family/transport/nearest${qs({ schoolId })}`) : Promise.resolve({ served: false })), [schoolId]);
  const b = bus.data;
  return (
    <div className="stack">
      {['bus', 'dropoff', 'walk', 'private'].map((m) => (
        <label key={m} className="check">
          <input type="radio" name="tmode" checked={mode === m} disabled={m === 'bus' && b && !b.served} onChange={() => setMode(m)} />
          <span>{t(`transport.${m}`)}
            {m === 'bus' && b?.served && <span className="small muted"> — {b.route_code} · {L(b, 'stop')} · <SeatBadge status={b.seat_status} /></span>}
            {m === 'bus' && b && !b.served && <span className="small muted"> — {t('parent.apply.bus_not_served')}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}
