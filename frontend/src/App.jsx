import { Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { ToastProvider } from "./context/ToastContext";
import HomePage from "./pages/HomePage";
import ChatPage from "./pages/ChatPage";
import InboxPage from "./pages/InboxPage";
import BoardPage from "./pages/BoardPage";
import AgentsPage from "./pages/AgentsPage";
import DocsPage from "./pages/DocsPage";
import CompanyBrainPage from "./pages/CompanyBrainPage";
import WorkflowsPage from "./pages/WorkflowsPage";
import CanvasPage from "./pages/CanvasPage";

export default function App() {
  return (
    <ToastProvider>
      <div className="app">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/board" element={<BoardPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/brain" element={<CompanyBrainPage />} />
            <Route path="/workflows" element={<WorkflowsPage />} />
            <Route path="/canvas" element={<CanvasPage />} />
            <Route path="*" element={<Navigate replace to="/" />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}
