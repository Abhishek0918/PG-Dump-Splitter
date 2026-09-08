import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProviders, useAppAuth } from "./contexts/AppContext";
import { AppLayout } from "./components/AppLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import SplitterPage from "./pages/SplitterPage";
import MigrationPage from "./pages/MigrationPage";
import ProfilePage from "./pages/ProfilePage";

function AuthenticatedRoutes() {
  const { user, loading } = useAppAuth();

  if (loading) {
    return <div className="app-loading">Loading workspace...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/splitter" element={<SplitterPage />} />
        <Route path="/migration" element={<MigrationPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProviders>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<AuthenticatedRoutes />} />
        </Routes>
      </AppProviders>
    </BrowserRouter>
  );
}
