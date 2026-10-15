import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { zapniOfflineHistorii } from "./lib/pwa-historie";
import "./index.css";

zapniOfflineHistorii();

const rootEl = document.getElementById("root");

if (rootEl === null) {
  throw new Error("Kořenový element #root nebyl nalezen.");
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
