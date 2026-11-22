import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { ToastProvider } from "./context/ToastContext";
import HomePage from "./pages/HomePage";
import ChatPage from "./pages/ChatPage";
import AIChatPage from "./pages/AIChatPage";
import InboxPage from "./pages/InboxPage";
import BoardPage from "./pages/BoardPage";
import AgentsPage from "./pages/AgentsPage";
import DocsPage from "./pages/DocsPage";
import CompanyBrainPage from "./pages/CompanyBrainPage";
import WorkflowsPage from "./pages/WorkflowsPage";
import CanvasPage from "./pages/CanvasPage";
import { WorkspaceProvider, useWorkspace } from "./context/WorkspaceContext";
import SignInPage from "./pages/SignInPage";
import LiveHomePage from "./pages/LiveHomePage";
import OrdersPage from "./pages/OrdersPage";
import NewOrderPage from "./pages/NewOrderPage";
import OrderDetailsPage from "./pages/OrderDetailsPage";
import BusinessProfilePage from "./pages/BusinessProfilePage";
import WorkspaceRecordsPage from "./pages/WorkspaceRecordsPage";
import ConnectedInboxPage, {
  ConversationPage,
} from "./pages/ConnectedInboxPage";
import ConnectionsPage, { CallbackPage } from "./pages/ConnectionsPage";
import BuilderPage from "./pages/BuilderPage";
import WhatsAppPage from "./pages/WhatsAppPage";

function Preview({ children }) {
  return (
    <>
      <div className="live-preview" role="status">
        Example screen · This content is a preview. Changes here are not saved
        to your business.
      </div>
      {children}
    </>
  );
}
function Workspace() {
  const { session, tenant, signOut, notice } = useWorkspace(),
    location = useLocation();
  if (location.pathname === "/google/callback")
    return <CallbackPage />;
  const isChat = location.pathname === "/chat";
  if (!session) return <SignInPage />;
  if (!tenant)
    return (
      <main className="live-state">
        <h1>No business workspace is available.</h1>
        {notice && <p role="alert">{notice}</p>}
        <button
          className="live-secondary"
          onClick={() => signOut().catch(() => {})}
        >
          Sign out
        </button>
      </main>
    );
  return (
    <div className={`app ${isChat ? "app--ai-chat" : ""}`}>
      {!isChat && <Sidebar />}
      <main className="main">
        <Routes key={tenant.id}>
          <Route path="/" element={<LiveHomePage />} />
          <Route path="/board" element={<OrdersPage />} />
          <Route path="/orders/new" element={<NewOrderPage />} />
          <Route path="/orders/:id" element={<OrderDetailsPage />} />
          <Route path="/settings" element={<BusinessProfilePage />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/builder" element={<BuilderPage />} />
          <Route path="/whatsapp" element={<WhatsAppPage />} />
          <Route path="/chat" element={<AIChatPage />} />
          <Route
            path="/preview/chat"
            element={
              <Preview>
                <ChatPage />
              </Preview>
            }
          />
          <Route path="/inbox" element={<ConnectedInboxPage />} />
          <Route path="/inbox/:id" element={<ConversationPage />} />
          <Route
            path="/agents"
            element={<WorkspaceRecordsPage key="agent" kind="agent" />}
          />
          <Route
            path="/docs"
            element={<WorkspaceRecordsPage key="document" kind="document" />}
          />
          <Route
            path="/brain"
            element={<WorkspaceRecordsPage key="knowledge" kind="knowledge" />}
          />
          <Route
            path="/workflows"
            element={<WorkspaceRecordsPage key="workflow" kind="workflow" />}
          />
          <Route
            path="/preview/inbox"
            element={
              <Preview>
                <InboxPage />
              </Preview>
            }
          />
          <Route
            path="/preview/agents"
            element={
              <Preview>
                <AgentsPage />
              </Preview>
            }
          />
          <Route
            path="/preview/docs"
            element={
              <Preview>
                <DocsPage />
              </Preview>
            }
          />
          <Route
            path="/preview/brain"
            element={
              <Preview>
                <CompanyBrainPage />
              </Preview>
            }
          />
          <Route
            path="/preview/workflows"
            element={
              <Preview>
                <WorkflowsPage />
              </Preview>
            }
          />
          <Route
            path="/canvas"
            element={
              <Preview>
                <CanvasPage />
              </Preview>
            }
          />
          <Route
            path="/preview/home"
            element={
              <Preview>
                <HomePage />
              </Preview>
            }
          />
          <Route
            path="/preview/board"
            element={
              <Preview>
                <BoardPage />
              </Preview>
            }
          />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <WorkspaceProvider>
        <Workspace />
      </WorkspaceProvider>
    </ToastProvider>
  );
}
