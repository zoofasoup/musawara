import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { BASE } from "./lib/api";
import { useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { ClientScopeProvider } from "./context/ClientScope";

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
const Spend = lazy(() => import("./pages/Spend").then((m) => ({ default: m.Spend })));
const Board = lazy(() => import("./pages/Board").then((m) => ({ default: m.Board })));
const Conversions = lazy(() => import("./pages/Conversions").then((m) => ({ default: m.Conversions })));
const Planning = lazy(() => import("./pages/Planning").then((m) => ({ default: m.Planning })));
const AssetsEntry = lazy(() => import("./pages/AssetsEntry").then((m) => ({ default: m.AssetsEntry })));
const Styleguide = lazy(() => import("./pages/Styleguide").then((m) => ({ default: m.Styleguide })));
const Shopee = lazy(() => import("./pages/Shopee").then((m) => ({ default: m.Shopee })));
const Organic = lazy(() => import("./pages/Organic").then((m) => ({ default: m.Organic })));
const ClientReport = lazy(() => import("./pages/ClientReport").then((m) => ({ default: m.ClientReport })));
const ShareReport = lazy(() => import("./pages/ClientReport").then((m) => ({ default: m.ShareReport })));
const Assets = lazy(() => import("./pages/Assets").then((m) => ({ default: m.Assets })));
const Approvals = lazy(() => import("./pages/Approvals").then((m) => ({ default: m.Approvals })));
const TeamApprovals = lazy(() => import("./pages/Approvals").then((m) => ({ default: m.TeamApprovals })));
const CrmInbox = lazy(() => import("./pages/crm/CrmInbox").then((m) => ({ default: m.CrmInbox })));
const CrmContacts = lazy(() => import("./pages/crm/CrmContacts").then((m) => ({ default: m.CrmContacts })));
const CrmTemplates = lazy(() => import("./pages/crm/CrmTemplates").then((m) => ({ default: m.CrmTemplates })));
const CrmCampaigns = lazy(() => import("./pages/crm/CrmCampaigns").then((m) => ({ default: m.CrmCampaigns })));
const CrmConnection = lazy(() => import("./pages/crm/CrmConnection").then((m) => ({ default: m.CrmConnection })));
import { CrmLayout } from "./pages/crm/CrmLayout";

function ProtectedRoute({ children, requireAdmin }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && user.role !== "admin") return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

/** Reads :id from the path so each client page receives a numeric clientId. */
function ClientRoute({ page: Page }: { page: React.ComponentType<{ clientId: number }> }) {
  const clientId = Number(useParams().id);
  if (!Number.isInteger(clientId)) return <Navigate to="/" replace />;
  return <Page clientId={clientId} />;
}

function RootRedirect() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <AdminHome />;
  return <Navigate to={`/c/${user.client_id}`} replace />;
}

export function App() {
  return (
    <BrowserRouter basename={BASE}>
      <ClientScopeProvider>
      <Suspense fallback={null}>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/invite/:token" element={<Invite />} />
        <Route path="/share/:token" element={<ShareView />} />
        <Route path="/share/:token/report" element={<ShareReport />} />

        {/* Protected Routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <RootRedirect />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute requireAdmin>
              <AdminSettings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/c/:id"
          element={
            <ProtectedRoute>
              <ClientRoute page={ClientDashboard} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/c/:id/creatives"
          element={
            <ProtectedRoute>
              <ClientRoute page={CreativeView} />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/c/:id/brand"
          element={
            <ProtectedRoute>
              <ClientRoute page={BrandKnowledge} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/c/:id/onboarding"
          element={
            <ProtectedRoute requireAdmin>
              <ClientRoute page={Onboarding} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/organic"
          element={
            <ProtectedRoute requireAdmin>
              <Organic />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assets"
          element={
            <ProtectedRoute requireAdmin>
              <AssetsEntry />
            </ProtectedRoute>
          }
        />
        <Route
          path="/styleguide"
          element={
            <ProtectedRoute requireAdmin>
              <Styleguide />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shopee"
          element={
            <ProtectedRoute requireAdmin>
              <Shopee />
            </ProtectedRoute>
          }
        />
        <Route
          path="/planning"
          element={
            <ProtectedRoute requireAdmin>
              <Planning />
            </ProtectedRoute>
          }
        />
        <Route
          path="/board"
          element={
            <ProtectedRoute requireAdmin>
              <Board />
            </ProtectedRoute>
          }
        />

        <Route
          path="/spend"
          element={
            <ProtectedRoute requireAdmin>
              <Spend />
            </ProtectedRoute>
          }
        />

        <Route
          path="/conversions"
          element={
            <ProtectedRoute requireAdmin>
              <Conversions />
            </ProtectedRoute>
          }
        />

        <Route
          path="/c/:id/report"
          element={
            <ProtectedRoute>
              <ClientRoute page={ClientReport} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/c/:id/approvals"
          element={
            <ProtectedRoute>
              <ClientRoute page={Approvals} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/c/:id/assets"
          element={
            <ProtectedRoute requireAdmin>
              <ClientRoute page={Assets} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/approvals"
          element={
            <ProtectedRoute requireAdmin>
              <TeamApprovals />
            </ProtectedRoute>
          }
        />
        <Route path="/crm" element={<Navigate to="/crm/inbox" replace />} />
        <Route
          path="/crm/inbox"
          element={
            <ProtectedRoute requireAdmin>
              <CrmLayout>
                <CrmInbox />
              </CrmLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/crm/contacts"
          element={
            <ProtectedRoute requireAdmin>
              <CrmLayout>
                <CrmContacts />
              </CrmLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/crm/templates"
          element={
            <ProtectedRoute requireAdmin>
              <CrmLayout>
                <CrmTemplates />
              </CrmLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/crm/broadcasts"
          element={
            <ProtectedRoute requireAdmin>
              <CrmLayout>
                <CrmCampaigns />
              </CrmLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/crm/connection"
          element={
            <ProtectedRoute requireAdmin>
              <CrmLayout>
                <CrmConnection />
              </CrmLayout>
            </ProtectedRoute>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </ClientScopeProvider>
    </BrowserRouter>
  );
}
