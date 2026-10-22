// Offer letter (PP-18). Printable page in the current language (right-to-left in Arabic);
// "Save as PDF" uses the browser's print-to-PDF.
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { useAsync, Loader } from '../../components/ui.jsx';
import { LangSwitch } from '../../components/Layout.jsx';
import { gradeLabel } from './shared.jsx';

export default function OfferLetter() {
  const { id } = useParams();
  const { t, L, fmtDate, fmtDateTime } = useI18n();
  const st = useAsync(() => api.get(`/family/applications/${id}`), [id]);
  return (
    <div style={{ background: 'var(--black-50)', minHeight: '100vh', padding: 16 }}>
      <div className="row no-print" style={{ maxWidth: 800, margin: '0 auto 12px', justifyContent: 'space-between' }}>
        <Link to={`/parent/applications/${id}`} className="btn secondary sm">← {t('common.back')}</Link>
        <div className="row">
          <LangSwitch />
          <button className="btn sm" onClick={() => window.print()}>{t('parent.letter.print')}</button>
        </div>
      </div>
      <Loader state={st}>
        {(d) => {
          const a = d.app;
          const accepted = a.status === 'accepted';
          const acceptedEvent = d.timeline.find((e) => e.action === 'accepted');
          if (!a.section) return <div className="alert warn" style={{ maxWidth: 800, margin: '0 auto' }}>{t('parent.letter.none')}</div>;
          return (
            <article style={{ maxWidth: 800, margin: '0 auto', background: '#fff', padding: '40px 48px', boxShadow: 'var(--shadow)', borderTop: '6px solid var(--gold-600)' }}>
              <header className="row between" style={{ borderBottom: '1px solid var(--gold-200)', paddingBottom: 16, marginBottom: 24 }}>
                <div className="row">
                  <div className="brand"><div className="mark">MoE</div></div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1.1rem' }}>{t('parent.letter.ministry')}</div>
                    <div className="small muted">{t('app.title')}</div>
                  </div>
                </div>
                <div className="small right">
                  <div>{t('parent.apply.reference')}: <b className="mono">{a.ref}</b></div>
                  <div>{t('common.date')}: {fmtDate(a.decided_at || a.updated_at)}</div>
                </div>
              </header>
              <h1 style={{ textAlign: 'center' }}>{accepted ? t('parent.letter.title_confirmed') : t('parent.letter.title_offer')}</h1>
              <p>{t('parent.letter.dear')}</p>
              <p>{t('parent.letter.body', { child: L(a.child, 'full_name'), school: L(a.school), ay: a.ay })}</p>
              <table className="table" style={{ margin: '18px 0', border: '1px solid var(--border)' }}>
                <tbody>
                  <tr><th>{t('parent.letter.student')}</th><td>{L(a.child, 'full_name')}</td></tr>
                  <tr><th>{t('parent.addchild.eid')}</th><td className="mono">{a.child.emirates_id}</td></tr>
                  <tr><th>{t('common.school')}</th><td>{L(a.school)}</td></tr>
                  <tr><th>{t('common.academic_year')}</th><td>{a.ay}</td></tr>
                  <tr><th>{t('common.grade')} / {t('common.section')}</th><td>{gradeLabel(t, a.grade)} – {a.section.name}</td></tr>
                  <tr><th>{t('parent.apply.step.transport')}</th><td>{a.transport_mode ? t(`transport.${a.transport_mode}`) : '—'}{a.bus?.route_code ? ` · ${a.bus.route_code} (${t(`status.${a.bus.status}`)})` : ''}</td></tr>
                  <tr><th>{t('common.status')}</th><td>{accepted ? t('parent.letter.accepted_on', { date: fmtDateTime(acceptedEvent?.at || a.decided_at) }) : t('parent.letter.accept_by', { date: fmtDate(a.offer_due_at) })}</td></tr>
                </tbody>
              </table>
              <p>{accepted ? t('parent.letter.next_steps') : t('parent.letter.lapse_note')}</p>
              <p style={{ marginTop: 40 }}>{t('parent.letter.regards')}</p>
              <p><b>{L(a.school)}</b><br /><span className="small muted">{t('parent.letter.registrar')}</span></p>
              <footer className="small muted" style={{ borderTop: '1px solid var(--border)', marginTop: 32, paddingTop: 10 }}>{t('parent.letter.footer')}</footer>
            </article>
          );
        }}
      </Loader>
    </div>
  );
}
