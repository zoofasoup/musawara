// The CRM sold to other businesses: only these pages are imported, so nothing of the agency platform ships in this build.
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { BASE } from "./lib/api";
import { ClientScopeProvider } from "./context/ClientScope";
import { CrmFrame, Needs, ProtectedLayout } from "./components/frames";
import { Login } from "./pages/Login";

const Reset = lazy(() => import("./pages/Reset").then((m) => ({ default: m.Reset })));
const Invite = lazy(() => import("./pages/Invite").then((m) => ({ default: m.Invite })));
const Profile = lazy(() => import("./pages/Profile").then((m) => ({ default: m.Profile })));
const CrmSettings = lazy(() => import("./pages/CrmSettings").then((m) => ({ default: m.CrmSettings })));
const CrmInbox = lazy(() => import("./pages/crm/CrmInbox").then((m) => ({ default: m.CrmInbox })));
const CrmPipeline = lazy(() => import("./pages/crm/pipeline/CrmPipeline").then((m) => ({ default: m.CrmPipeline })));
const CrmTasks = lazy(() => import("./pages/crm/CrmTasks").then((m) => ({ default: m.CrmTasks })));
const CrmContacts = lazy(() => import("./pages/crm/CrmContacts").then((m) => ({ default: m.CrmContacts })));
const CrmTemplates = lazy(() => import("./pages/crm/CrmTemplates").then((m) => ({ default: m.CrmTemplates })));
const CrmCampaigns = lazy(() => import("./pages/crm/CrmCampaigns").then((m) => ({ default: m.CrmCampaigns })));
const CrmConnection = lazy(() => import("./pages/crm/CrmConnection").then((m) => ({ default: m.CrmConnection })));

export function CrmApp() {
  return (
    <BrowserRouter basename={BASE}>
      <ClientScopeProvider>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/invite/:token" element={<Invite />} />
            <Route path="/reset/:token" element={<Reset />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/profile" element={<Profile />} />
              <Route element={<Needs feature="settings" />}>
                <Route path="/settings" element={<CrmSettings />} />
              </Route>
              <Route element={<Needs feature="crm" />}>
                <Route path="/crm" element={<Navigate to="/crm/inbox" replace />} />
                <Route element={<CrmFrame />}>
                  <Route path="/crm/inbox" element={<CrmInbox />} />
                  <Route path="/crm/pipeline" element={<CrmPipeline />} />
                  <Route path="/crm/tasks" element={<CrmTasks />} />
                  <Route path="/crm/contacts" element={<CrmContacts />} />
                  <Route path="/crm/templates" element={<CrmTemplates />} />
                  <Route path="/crm/broadcasts" element={<CrmCampaigns />} />
                  <Route path="/crm/connection" element={<CrmConnection />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/crm" replace />} />
          </Routes>
        </Suspense>
      </ClientScopeProvider>
    </BrowserRouter>
  );
}
