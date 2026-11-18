import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import { BASE } from "./lib/api";
import { useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { ClientFrame } from "./components/ClientFrame";
import { ClientScopeProvider, useClientScope } from "./context/ClientScope";
import { CardSkeleton } from "./components/ui";

// Pages
const AdminHome = lazy(() => import("./pages/AdminHome").then((m) => ({ default: m.AdminHome })));
const ClientDashboard = lazy(() => import("./pages/ClientDashboard").then((m) => ({ default: m.ClientDashboard })));
const CreativeView = lazy(() => import("./pages/CreativeView").then((m) => ({ default: m.CreativeView })));
const Invite = lazy(() => import("./pages/Invite").then((m) => ({ default: m.Invite })));
import { Login } from "./pages/Login";
const ShareView = lazy(() => import("./pages/ShareView").then((m) => ({ default: m.ShareView })));
const AdminSettings = lazy(() => import("./pages/AdminSettings").then((m) => ({ default: m.AdminSettings })));
const BrandKnowledge = lazy(() => import("./pages/BrandKnowledge").then((m) => ({ default: m.BrandKnowledge })));
const Onboarding = lazy(() => import("./pages/Onboarding").then((m) => ({ default: m.Onboarding })));
const Clients = lazy(() => import("./pages/Clients").then((m) => ({ default: m.Clients })));
const Spend = lazy(() => import("./pages/Spend").then((m) => ({ default: m.Spend })));
const Board = lazy(() => import("./pages/Board").then((m) => ({ default: m.Board })));
const Conversions = lazy(() => import("./pages/Conversions").then((m) => ({ default: m.Conversions })));
const Planning = lazy(() => import("./pages/Planning").then((m) => ({ default: m.Planning })));
const Styleguide = lazy(() => import("./pages/Styleguide").then((m) => ({ default: m.Styleguide })));
const Profile = lazy(() => import("./pages/Profile").then((m) => ({ default: m.Profile })));
const Shopee = lazy(() => import("./pages/Shopee").then((m) => ({ default: m.Shopee })));
const Organic = lazy(() => import("./pages/Organic").then((m) => ({ default: m.Organic })));
const ClientReport = lazy(() => import("./pages/ClientReport").then((m) => ({ default: m.ClientReport })));
const ShareReport = lazy(() => import("./pages/ClientReport").then((m) => ({ default: m.ShareReport })));
const Assets = lazy(() => import("./pages/Assets").then((m) => ({ default: m.Assets })));
const ClientAlerts = lazy(() => import("./pages/ClientAlerts").then((m) => ({ default: m.ClientAlerts })));
const Approvals = lazy(() => import("./pages/Approvals").then((m) => ({ default: m.Approvals })));
const TeamApprovals = lazy(() => import("./pages/Approvals").then((m) => ({ default: m.TeamApprovals })));
const CrmInbox = lazy(() => import("./pages/crm/CrmInbox").then((m) => ({ default: m.CrmInbox })));
const CrmContacts = lazy(() => import("./pages/crm/CrmContacts").then((m) => ({ default: m.CrmContacts })));
const CrmTemplates = lazy(() => import("./pages/crm/CrmTemplates").then((m) => ({ default: m.CrmTemplates })));
const CrmCampaigns = lazy(() => import("./pages/crm/CrmCampaigns").then((m) => ({ default: m.CrmCampaigns })));
const CrmConnection = lazy(() => import("./pages/crm/CrmConnection").then((m) => ({ default: m.CrmConnection })));
import { CrmLayout } from "./pages/crm/CrmLayout";

/** Signed-in frame. It stays mounted while the page inside it changes, so moving between menus never redraws the sidebar. */
function ProtectedLayout() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Layout>
      <Suspense fallback={<div className="space-y-4"><CardSkeleton lines={2} /><CardSkeleton lines={4} /></div>}>
        <Outlet />
      </Suspense>
    </Layout>
  );
}

function AdminOnly() {
  const { user } = useAuth();
  return user?.role === "admin" ? <Outlet /> : <Navigate to="/" replace />;
}

/** The CRM tab bar and number switcher stay put while the section underneath changes. */
function CrmFrame() {
  return (
    <CrmLayout>
      <Outlet />
    </CrmLayout>
  );
}

/** Old address of a page that now lives under a client (/shopee, /organic ...): go to the chosen client's page, or pick a client. */
function ScopedRedirect({ to }: { to: string }) {
  const { loading, singleId, clientId } = useClientScope();
  const { search } = useLocation();
  if (loading && clientId === null) return <CardSkeleton lines={3} />;
  const id = clientId ?? singleId;
  return <Navigate to={id ? `/c/${id}/${to}${search}` : "/clients"} replace />;
}

/** Reads :id from the path so each client page receives a numeric clientId. */
function ClientRoute({ page: Page }: { page: React.ComponentType<{ clientId: number }> }) {
  const clientId = Number(useParams().id);
  if (!Number.isInteger(clientId)) return <Navigate to="/" replace />;
  return <Page clientId={clientId} />;
}

function RootRedirect() {
  const { user } = useAuth();
  if (user?.role === "admin") return <AdminHome />;
  return <Navigate to={`/c/${user?.client_id}`} replace />;
}

/** Fetch every page's code once the app is idle, so moving between menus never waits on a download. */
const PAGES = [
  () => import("./pages/AdminHome"), () => import("./pages/ClientDashboard"), () => import("./pages/CreativeView"), () => import("./pages/ClientAlerts"),
  () => import("./pages/Approvals"), () => import("./pages/Assets"), () => import("./pages/BrandKnowledge"), () => import("./pages/ClientReport"),
  () => import("./pages/Onboarding"), () => import("./pages/Spend"), () => import("./pages/SalesGrid"), () => import("./pages/Conversions"), () => import("./pages/Clients"),
  () => import("./pages/Planning"), () => import("./pages/Board"), () => import("./pages/Shopee"), () => import("./pages/Organic"),
  () => import("./pages/AdminSettings"), () => import("./pages/Profile"), () => import("./pages/crm/CrmInbox"), () => import("./pages/crm/CrmContacts"),
];
function usePrefetchPages() {
  useEffect(() => {
    const run = () => PAGES.forEach((load, i) => setTimeout(() => void load().catch(() => {}), i * 120));
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(run);
    else setTimeout(run, 1500);
  }, []);
}

export function App() {
  usePrefetchPages();
  return (
    // startTransition: while a page's code or data is loading, the page you are on stays up instead of flashing a skeleton
    <BrowserRouter basename={BASE} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ClientScopeProvider>
        <Suspense fallback={null}>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />
            <Route path="/invite/:token" element={<Invite />} />
            <Route path="/share/:token" element={<ShareView />} />
            <Route path="/share/:token/report" element={<ShareReport />} />

            {/* Signed in: one persistent frame */}
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/c/:id" element={<ClientFrame />}>
                <Route index element={<ClientRoute page={ClientDashboard} />} />
                <Route path="creatives" element={<ClientRoute page={CreativeView} />} />
                <Route path="alerts" element={<ClientRoute page={ClientAlerts} />} />
                <Route path="brand" element={<ClientRoute page={BrandKnowledge} />} />
                <Route path="report" element={<ClientRoute page={ClientReport} />} />
                <Route path="approvals" element={<ClientRoute page={Approvals} />} />
                {/* Team only */}
                <Route element={<AdminOnly />}>
                  <Route path="onboarding" element={<ClientRoute page={Onboarding} />} />
                  <Route path="assets" element={<ClientRoute page={Assets} />} />
                  <Route path="sales" element={<ClientRoute page={Conversions} />} />
                  <Route path="organic" element={<ClientRoute page={Organic} />} />
                  <Route path="shopee" element={<ClientRoute page={Shopee} />} />
                </Route>
              </Route>

              {/* Team only */}
              <Route element={<AdminOnly />}>
                <Route path="/settings" element={<AdminSettings />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/assets" element={<ScopedRedirect to="assets" />} />
                <Route path="/styleguide" element={<Styleguide />} />
                <Route path="/shopee" element={<ScopedRedirect to="shopee" />} />
                <Route path="/planning" element={<Planning />} />
                <Route path="/board" element={<Board />} />
                <Route path="/spend" element={<Spend />} />
                <Route path="/conversions" element={<ScopedRedirect to="sales" />} />
                <Route path="/organic" element={<ScopedRedirect to="organic" />} />
                <Route path="/approvals" element={<TeamApprovals />} />
                <Route path="/crm" element={<Navigate to="/crm/inbox" replace />} />
                <Route element={<CrmFrame />}>
                  <Route path="/crm/inbox" element={<CrmInbox />} />
                  <Route path="/crm/contacts" element={<CrmContacts />} />
                  <Route path="/crm/templates" element={<CrmTemplates />} />
                  <Route path="/crm/broadcasts" element={<CrmCampaigns />} />
                  <Route path="/crm/connection" element={<CrmConnection />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ClientScopeProvider>
    </BrowserRouter>
  );
}
