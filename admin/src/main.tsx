import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App.tsx";
import { AuthProvider } from "./context/AuthContext.tsx";

// The team's tool lives on app.musawara.id; the public site's /admin path only forwards there.
const host = window.location.hostname;
if (host === "musawara.id" || host === "www.musawara.id") {
  const path = window.location.pathname.replace(/^\/admin/, "") || "/";
  window.location.replace(`https://app.musawara.id${path}${window.location.search}${window.location.hash}`);
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </StrictMode>
  );
}
