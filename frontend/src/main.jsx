import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/inter";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/home.css";
import "./styles/chat.css";
import "./styles/inbox.css";
import "./styles/board.css";
import "./styles/agents.css";
import "./styles/docs.css";
import "./styles/brain.css";
import "./styles/workflows.css";
import "./styles/canvas.css";
import "./styles/connected.css";
import "./styles/workspace.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
