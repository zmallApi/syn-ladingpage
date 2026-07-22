import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { isAuthenticated } from "./lib/api";
import { Shell } from "./components/Shell";
import { LoginPage } from "./pages/LoginPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { WizardPage } from "./pages/WizardPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { AgentsMcpPage } from "./pages/AgentsMcpPage";
import { EnginesPage } from "./pages/EnginesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { MetricsPage } from "./pages/MetricsPage";

function RequireAuth() {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<WizardPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/projects/:id/wizard" element={<WizardPage />} />
          <Route path="/agents" element={<AgentsMcpPage />} />
          <Route path="/agents/:id" element={<AgentsMcpPage />} />
          <Route path="/engines" element={<EnginesPage />} />
          <Route path="/metrics" element={<MetricsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
