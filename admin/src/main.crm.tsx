import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { CrmApp } from "./CrmApp";
import { AuthProvider } from "./context/AuthContext.tsx";
import { LangProvider } from "./context/LangContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LangProvider>
      <AuthProvider>
        <CrmApp />
      </AuthProvider>
    </LangProvider>
  </StrictMode>
);
