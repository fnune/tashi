import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { applyTheme, savedTheme } from "./theme.js";
import "@fontsource-variable/open-sans";
import "@tashi/design-system/tokens.css";
import "./tokens.css";
import "./styles.css";

applyTheme(savedTheme());

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
