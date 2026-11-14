import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import "@fontsource/aref-ruqaa/400.css";
import "@fontsource/aref-ruqaa/700.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "./router";
import App from "./App";
import "./styles.css";
import "./panel-theme.css";
import { installGlobalDigitNormalization } from "./digits";

installGlobalDigitNormalization();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
