import { Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { ToastProvider } from "./context/ToastContext";
import ConnectedChatPage from "./pages/ConnectedChatPage";
import ConnectedInboxPage, {
  ConversationPage,
} from "./pages/ConnectedInboxPage";
import WorkspaceRecordsPage from "./pages/WorkspaceRecordsPage";
import { WorkspaceProvider, useWorkspace } from "./context/WorkspaceContext";
import SignInPage from "./pages/SignInPage";
import LiveHomePage from "./pages/LiveHomePage";
import OrdersPage from "./pages/OrdersPage";
import NewOrderPage from "./pages/NewOrderPage";
import OrderDetailsPage from "./pages/OrderDetailsPage";
import BusinessProfilePage from "./pages/BusinessProfilePage";

function Workspace() {
  const { session, tenant, signOut, notice } = useWorkspace();
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
    <div className="app">
      <Sidebar />
      <main className="main">
        <Routes key={tenant.id}>
          <Route path="/" element={<LiveHomePage />} />
          <Route path="/board" element={<OrdersPage />} />
          <Route path="/orders/new" element={<NewOrderPage />} />
          <Route path="/orders/:id" element={<OrderDetailsPage />} />
          <Route path="/settings" element={<BusinessProfilePage />} />
          <Route path="/chat" element={<ConnectedChatPage />} />
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
            path="/canvas"
            element={<WorkspaceRecordsPage key="canvas" kind="canvas" />}
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
