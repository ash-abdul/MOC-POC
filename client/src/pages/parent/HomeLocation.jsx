// Home location (PP-07, PP-08): device location or map / area / Makani search, movable pin,
// emirate + area + catchment shown, primary-residence confirmation.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { useAuth } from '../../auth.jsx';
import { useAsync, PageHead, Card, Modal, Kv, useAction, useToast } from '../../components/ui.jsx';
import MapView from '../../components/MapView.jsx';

const PILOT_CENTER = [25.3, 55.45];

export default function HomeLocation() {
  const { t, L } = useI18n();
  const { school } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const next = params.get('next');
  const fam = useAsync(() => api.get('/family'), []);
  const catchments = useAsync(() => api.get('/lookups/catchments'), []);
  const [ask, setAsk] = useState(true);
  const [pin, setPin] = useState(null);
  const [loc, setLoc] = useState(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [run, busy] = useAction();

  useEffect(() => {
    const f = fam.data?.family;
    if (f?.home_lat && !pin) setPin({ lat: f.home_lat, lng: f.home_lng });
  }, [fam.data]);

  useEffect(() => {
    if (!pin) return;
    setConfirmed(false);
    api.get(`/mock/maps/reverse${qs(pin)}`).then(setLoc);
  }, [pin?.lat, pin?.lng]);

  const useDevice = () => {
    setAsk(false);
    if (!navigator.geolocation) return toast(t('parent.home.geo_unavailable'), 'error');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); setPin({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { setLocating(false); toast(t('parent.home.geo_refused'), 'error'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const search = async (e) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    if (/^\d{5}\s?\d{5}$/.test(v)) {
      const m = await api.get(`/mock/maps/makani/${v.replace(/\s/g, '')}`);
      if (m?.lat) { setPin(m); setResults([]); } else toast(t('parent.home.makani_invalid'), 'error');
      return;
    }
    const r = await api.get(`/mock/maps/search${qs({ q: v })}`);
    setResults(r);
    if (!r.length) toast(t('parent.home.no_results'), 'error');
  };

  const save = () => run(async () => {
    await api.put('/family/home', { lat: pin.lat, lng: pin.lng, confirmed: true });
    nav(next || '/parent');
  }, t('parent.home.saved'));

  const containing = loc?.catchments || [];
  const polygons = (catchments.data || []).filter((c) => containing.includes(c.school_id)).map((c) => ({ geojson: c.geojson, label: L(c), color: '#92722a' }));

  return (
    <>
      <PageHead title={t('parent.home.title')} sub={t('parent.home.sub')} reqs={['PP-07', 'PP-08']} />
      {next && <div className="alert info small mb">{t('parent.home.next_note')}</div>}
      <div className="row" style={{ alignItems: 'stretch', gap: 16 }}>
        <Card style={{ flex: '2 1 460px', minWidth: 0 }}>
          <form className="row mb" onSubmit={search}>
            <input style={{ flex: 1, minWidth: 180 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('parent.home.search_ph')} />
            <button className="btn secondary">{t('common.search')}</button>
            <button type="button" className="btn ghost" onClick={useDevice} disabled={locating}>📍 {t('parent.home.use_device')}</button>
          </form>
          {results.length > 0 && (
            <div className="row mb">
              {results.map((r, i) => <button key={i} className="btn secondary sm" onClick={() => { setPin({ lat: r.lat, lng: r.lng }); setResults([]); }}>{L(r)}</button>)}
            </div>
          )}
          <MapView className="tall" center={pin ? [pin.lat, pin.lng] : PILOT_CENTER} zoom={pin ? 14 : 12} home={pin} onHomeChange={setPin} onClick={setPin} polygons={polygons} />
          <p className="small muted" style={{ marginTop: 6 }}>{t('parent.home.map_hint')}</p>
        </Card>
        <Card title={t('parent.home.selected')} style={{ flex: '1 1 280px', marginTop: 0 }}>
          {!pin ? <p className="small muted">{t('parent.home.no_pin')}</p> : (
            <>
              <Kv items={[
                [t('common.emirate'), loc?.emirate || '—'],
                [t('parent.home.area'), loc ? L(loc, 'area') || '—' : '…'],
                [t('parent.home.makani'), <span className="mono">{loc?.makani}</span>],
                [t('parent.home.coords'), <span className="mono small">{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</span>],
              ]} />
              {loc && !loc.covered && <div className="alert error small mt">{t('parent.home.outside')}</div>}
              {loc?.covered && (
                <>
                  <h4 className="mt">{t('parent.home.catchment')}</h4>
                  {containing.length === 0 ? <p className="small muted">{t('parent.home.no_catchment')}</p> : (
                    <ul className="small" style={{ paddingInlineStart: 18, margin: 0 }}>
                      {containing.map((id) => <li key={id}>{L(school(id))}</li>)}
                    </ul>
                  )}
                  <p className="small muted mt">{t('parent.home.used_for')}</p>
                  <label className="check small mt">
                    <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                    <span>{t('parent.home.confirm_primary')}</span>
                  </label>
                  <button className="btn mt" style={{ width: '100%' }} disabled={!confirmed || busy} onClick={save}>{t('parent.home.save')}</button>
                </>
              )}
            </>
          )}
        </Card>
      </div>
      {ask && (
        <Modal title={t('parent.home.ask_title')} onClose={() => setAsk(false)} footer={
          <>
            <button className="btn secondary" onClick={() => setAsk(false)}>{t('parent.home.ask_no')}</button>
            <button className="btn" onClick={useDevice}>{t('parent.home.ask_yes')}</button>
          </>
        }>
          <p>{t('parent.home.ask_text')}</p>
          <p className="small muted">{t('parent.home.ask_note')}</p>
        </Modal>
      )}
    </>
  );
}
