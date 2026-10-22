import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { useI18n } from './i18n.jsx';
import Layout, { HOME_FOR } from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';

import Landing from './pages/Landing.jsx';
import UaePass from './pages/UaePass.jsx';
import Docs from './pages/Docs.jsx';
import Inbox from './pages/Inbox.jsx';
import Outbox from './pages/mock/Outbox.jsx';
// parent portal
import Family from './pages/parent/Family.jsx';
import Profile from './pages/parent/Profile.jsx';
import HomeLocation from './pages/parent/HomeLocation.jsx';
import AddChild from './pages/parent/AddChild.jsx';
import Apply from './pages/parent/Apply.jsx';
import Track from './pages/parent/Track.jsx';
import OfferLetter from './pages/parent/OfferLetter.jsx';
import Renew from './pages/parent/Renew.jsx';
import Leave from './pages/parent/Leave.jsx';
import Documents from './pages/parent/Documents.jsx';
import GuardianLink from './pages/parent/GuardianLink.jsx';
// back office
import Queue from './pages/staff/Queue.jsx';
import AppReview from './pages/staff/AppReview.jsx';
import SchoolCapacity from './pages/staff/SchoolCapacity.jsx';
import Leavers from './pages/staff/Leavers.jsx';
import Cluster from './pages/staff/Cluster.jsx';
import Transport from './pages/transport/Transport.jsx';
// administration
import CapacityAdmin from './pages/admin/CapacityAdmin.jsx';
import Catchments from './pages/admin/Catchments.jsx';
import Rules from './pages/admin/Rules.jsx';
import Windows from './pages/admin/Windows.jsx';
import Lists from './pages/admin/Lists.jsx';
import Holidays from './pages/admin/Holidays.jsx';
import Templates from './pages/admin/Templates.jsx';
import Users from './pages/admin/Users.jsx';
import Translations from './pages/admin/Translations.jsx';
import Audit from './pages/admin/Audit.jsx';
import Demo from './pages/admin/Demo.jsx';
// insights
import Dashboard from './pages/insights/Dashboard.jsx';
import Reports from './pages/insights/Reports.jsx';

function Guard({ roles, children }) {
  const { me } = useAuth();
  const loc = useLocation();
  if (!me) return <Navigate to="/" state={{ from: loc.pathname }} replace />;
  if (roles && !roles.includes(me.role)) return <Navigate to={HOME_FOR[me.role]} replace />;
  return children;
}

const P = ['parent'];
const SCHOOL = ['registrar', 'principal', 'cluster_officer', 'ministry_admin', 'ministry_viewer'];
const ADMIN = ['ministry_admin', 'ministry_viewer'];
const INSIGHT = ['principal', 'cluster_officer', 'ministry_admin', 'ministry_viewer', 'transport'];

export default function App() {
  const { loading } = useAuth();
  const { ready } = useI18n();
  if (loading || !ready) return <Spinner />;
  return (
    <Routes>
      <Route path="/" element={<Layout><Landing /></Layout>} />
      <Route path="/uaepass" element={<UaePass />} />
      <Route path="/docs" element={<Layout><Docs /></Layout>} />
      <Route path="/inbox" element={<Guard><Layout><Inbox /></Layout></Guard>} />
      <Route path="/mock/outbox" element={<Guard><Layout><Outbox /></Layout></Guard>} />

      <Route path="/parent" element={<Guard roles={P}><Layout><Family /></Layout></Guard>} />
      <Route path="/parent/link" element={<Guard roles={P}><Layout><GuardianLink /></Layout></Guard>} />
      <Route path="/parent/profile" element={<Guard roles={P}><Layout><Profile /></Layout></Guard>} />
      <Route path="/parent/home-location" element={<Guard roles={P}><Layout><HomeLocation /></Layout></Guard>} />
      <Route path="/parent/documents" element={<Guard roles={P}><Layout><Documents /></Layout></Guard>} />
      <Route path="/parent/children/new" element={<Guard roles={P}><Layout><AddChild /></Layout></Guard>} />
      <Route path="/parent/children/:id/renew" element={<Guard roles={P}><Layout><Renew /></Layout></Guard>} />
      <Route path="/parent/children/:id/leave" element={<Guard roles={P}><Layout><Leave /></Layout></Guard>} />
      <Route path="/parent/apply/:id" element={<Guard roles={P}><Layout><Apply /></Layout></Guard>} />
      <Route path="/parent/applications/:id" element={<Guard roles={P}><Layout><Track /></Layout></Guard>} />
      <Route path="/parent/applications/:id/offer-letter" element={<Guard roles={P}><OfferLetter /></Guard>} />

      <Route path="/school/queue" element={<Guard roles={SCHOOL}><Layout><Queue /></Layout></Guard>} />
      <Route path="/school/applications/:id" element={<Guard roles={[...SCHOOL, 'transport']}><Layout><AppReview /></Layout></Guard>} />
      <Route path="/school/capacity" element={<Guard roles={['registrar', 'principal']}><Layout><SchoolCapacity /></Layout></Guard>} />
      <Route path="/school/leavers" element={<Guard roles={['registrar', 'principal', 'cluster_officer']}><Layout><Leavers /></Layout></Guard>} />
      <Route path="/cluster" element={<Guard roles={['cluster_officer', 'ministry_admin', 'ministry_viewer']}><Layout><Cluster /></Layout></Guard>} />
      <Route path="/transport" element={<Guard roles={['transport', 'ministry_admin', 'ministry_viewer']}><Layout><Transport /></Layout></Guard>} />

      <Route path="/admin/capacity" element={<Guard roles={ADMIN}><Layout><CapacityAdmin /></Layout></Guard>} />
      <Route path="/admin/catchments" element={<Guard roles={ADMIN}><Layout><Catchments /></Layout></Guard>} />
      <Route path="/admin/rules" element={<Guard roles={ADMIN}><Layout><Rules /></Layout></Guard>} />
      <Route path="/admin/windows" element={<Guard roles={ADMIN}><Layout><Windows /></Layout></Guard>} />
      <Route path="/admin/lists" element={<Guard roles={ADMIN}><Layout><Lists /></Layout></Guard>} />
      <Route path="/admin/holidays" element={<Guard roles={ADMIN}><Layout><Holidays /></Layout></Guard>} />
      <Route path="/admin/templates" element={<Guard roles={ADMIN}><Layout><Templates /></Layout></Guard>} />
      <Route path="/admin/users" element={<Guard roles={ADMIN}><Layout><Users /></Layout></Guard>} />
      <Route path="/admin/translations" element={<Guard roles={ADMIN}><Layout><Translations /></Layout></Guard>} />
      <Route path="/admin/audit" element={<Guard roles={ADMIN}><Layout><Audit /></Layout></Guard>} />
      <Route path="/admin/demo" element={<Guard roles={['ministry_admin']}><Layout><Demo /></Layout></Guard>} />

      <Route path="/insights" element={<Guard roles={INSIGHT}><Layout><Dashboard /></Layout></Guard>} />
      <Route path="/insights/reports" element={<Guard roles={INSIGHT}><Layout><Reports /></Layout></Guard>} />
      <Route path="/insights/reports/:id" element={<Guard roles={INSIGHT}><Layout><Reports /></Layout></Guard>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
