import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AdminPage } from "./components/AdminPage";
import { TermsPage } from "./components/TermsPage";
import "./styles.css";

function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  useEffect(() => window.scrollTo(0, 0), [hash]);
  if (hash === "#admin") return <AdminPage />;
  if (hash === "#terms" || hash === "#refunds") return <TermsPage />;
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
