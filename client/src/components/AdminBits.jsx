// Small helpers shared by the administration screens.
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';

// Ministry Viewers see every admin screen read-only (A13); the server also refuses their writes.
export function useReadOnly() {
  const { me } = useAuth();
  return me.role !== 'ministry_admin';
}

export function ReadOnlyNote() {
  const { t } = useI18n();
  return useReadOnly() ? <div className="alert info small mb">🔒 {t('common.read_only')} – {t('bo.admin.viewer_note')}</div> : null;
}
