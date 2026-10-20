import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";

// Pages
import { AdminHome } from "./pages/AdminHome";
import { ClientDashboard } from "./pages/ClientDashboard";
import { CreativeView } from "./pages/CreativeView";
import { Invite } from "./pages/Invite";
import { Login } from "./pages/Login";
import { ShareView } from "./pages/ShareView";
import { AdminSettings } from "./pages/AdminSettings";
import { BrandKnowledge } from "./pages/BrandKnowledge";
import { Onboarding } from "./pages/Onboarding";

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
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/invite/:token" element={<Invite />} />
        <Route path="/share/:token" element={<ShareView />} />

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

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
