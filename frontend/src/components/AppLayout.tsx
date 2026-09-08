import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useAppAuth, useTheme } from "../contexts/AppContext";
import type { ThemeMode } from "../contexts/AppContext";
import { initialsFor } from "../helpers";

export function AppLayout() {
  const { user, signOut } = useAppAuth();
  const { theme, setTheme } = useTheme();

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="product-shell">
      <header className="product-toolbar">
        <NavLink className="product-brand" to="/">
          <span className="brand-mark">PG</span>
          <span>
            <strong>PGSplit Workspace</strong>
            <small>Schema split and PostgreSQL migration</small>
          </span>
        </NavLink>
        <nav className="product-nav">
          <NavLink to="/" end className={({ isActive }) => isActive ? "active" : ""}>Home</NavLink>
          <NavLink to="/splitter" className={({ isActive }) => isActive ? "active" : ""}>Database Schema Splitter</NavLink>
          <NavLink to="/migration" className={({ isActive }) => isActive ? "active" : ""}>Database Migration</NavLink>
          <NavLink to="/profile" className={({ isActive }) => isActive ? "active" : ""}>Profile</NavLink>
        </nav>
        <div className="product-actions">
          <select value={theme} onChange={(event) => setTheme(event.target.value as ThemeMode)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <div className="user-chip"><span>{initialsFor(user.name || user.email)}</span><strong>{user.name || user.email}</strong></div>
          <button className="tool-button" onClick={() => void signOut()}>Logout</button>
        </div>
      </header>
      <main className="product-main">
        <Outlet />
      </main>
    </div>
  );
}
