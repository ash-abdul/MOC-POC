// Helpers shared by the parent portal screens.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { Modal, useAction, Spinner } from '../../components/ui.jsx';

export const gradeLabel = (t, g) => (g ? t(`grade.${g}`) : '—');

// "Eligible for KG1, AY 2027-28" (PP-05)
export function EligibleText({ eligible }) {
  const { t } = useI18n();
  if (!eligible?.grade) return <span className="muted">{t(`parent.elig.${eligible?.reason || 'none'}`)}</span>;
  return <span>{t('parent.elig.text', { grade: gradeLabel(t, eligible.grade), ay: eligible.ay })} · {t(`cycle.${eligible.cycle}`)}</span>;
}

// Deadline banner shown when the parent must act (PP-18)
export function ActionBanner({ app, onOpen }) {
  const { t, fmtDate } = useI18n();
  if (!app) return null;
  if (app.status === 'offer_made') {
    return <div className="alert gold small"><b>{t('parent.action.offer')}</b>&nbsp;{t('parent.action.by', { date: fmtDate(app.offer_due_at) })}{onOpen && <button className="btn sm" style={{ marginInlineStart: 'auto' }} onClick={onOpen}>{t('parent.action.respond')}</button>}</div>;
  }
  if (app.status === 'info_requested') {
    return <div className="alert warn small"><b>{t('parent.action.info')}</b>&nbsp;{t('parent.action.by', { date: fmtDate(app.info_due_at) })}{onOpen && <button className="btn sm" style={{ marginInlineStart: 'auto' }} onClick={onOpen}>{t('parent.action.respond')}</button>}</div>;
  }
  return null;
}

// PP-09: pathway choice after the SIS check; creates the draft and opens the wizard
export function PathwayModal({ child, onClose }) {
  const { t, L } = useI18n();
  const nav = useNavigate();
  const [info, setInfo] = useState(null);
  const [run, busy] = useAction();
  useEffect(() => { api.get(`/family/children/${child.id}/pathways`).then(setInfo); }, [child.id]);
  const choose = (p) => {
    if (p === 'renewal') return nav(`/parent/children/${child.id}/renew`);
    run(async () => {
      const app = await api.post('/family/applications', { childId: child.id, pathway: p });
      nav(`/parent/apply/${app.id}`);
    });
  };
  const transferClosed = info && !info.transfer_window.open;
  return (
    <Modal title={t('parent.pathway.title', { name: L(child, 'full_name') })} onClose={onClose}>
      {!info ? <Spinner /> : (
        <>
          <div className={`alert ${info.sis.enrolled ? 'gold' : 'info'} small mb`}>
            {info.sis.enrolled
              ? t('parent.pathway.sis_yes', { school: L(info.sis, 'school'), grade: gradeLabel(t, info.sis.grade) })
              : t('parent.pathway.sis_no')}
          </div>
          <div className="stack">
            {info.pathways.map((p) => {
              const isTransfer = p !== 'new' && p !== 'renewal';
              const disabled = (p === 'renewal' && !info.renewal_window.open) || (p === 'new' && !info.new_window.open);
              return (
                <button key={p} className="btn secondary" style={{ width: '100%', justifyContent: 'space-between', whiteSpace: 'normal', textAlign: 'start' }} disabled={busy || disabled} onClick={() => choose(p)}>
                  <span>
                    <b>{t(`pathway.${p}`)}</b>
                    <span className="small muted" style={{ display: 'block' }}>{t(`parent.pathway.desc.${p}`)}</span>
                    {isTransfer && transferClosed && <span className="badge amber" style={{ marginTop: 4 }}>{t('parent.pathway.exceptional')}</span>}
                    {disabled && <span className="badge red" style={{ marginTop: 4 }}>{t('parent.pathway.window_closed')}</span>}
                  </span>
                  <span>→</span>
                </button>
              );
            })}
          </div>
          {transferClosed && info.pathways.some((p) => p !== 'new' && p !== 'renewal') && (
            <p className="small muted mt">{t('parent.pathway.exceptional_note', { open: info.transfer_window.window?.open_date || '—' })}</p>
          )}
        </>
      )}
    </Modal>
  );
}
