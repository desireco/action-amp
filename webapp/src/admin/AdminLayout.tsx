import type { ReactNode } from "react";
import { Link, NavLink, Navigate, useLocation } from "react-router";
import { useAuth } from "wasp/client/auth";
import { BrandMark } from "../components/ui";
import "./AdminLayout.css";

const NAV = [
  { label: "Overview", to: "/app/admin/overview", end: true },
  { label: "Funnel", to: "/app/admin/funnel", end: false },
  { label: "Feedback", to: "/app/admin/feedback", end: false },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { data: user, status } = useAuth();
  const location = useLocation();

  if (status === "loading") return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) {
    return (
      <div className="aa-admin-denied">
        <h1>Admin access required.</h1>
        <p>This area is only available to ActionAmp administrators.</p>
        <Link to="/app">Back to Next</Link>
      </div>
    );
  }

  return (
    <div className="aa-admin-workspace">
      <aside className="aa-admin-rail">
        <Link className="aa-admin-brand" to="/app" aria-label="Back to ActionAmp">
          <span className="aa-admin-brand__mark"><BrandMark size="sm" /></span>
          <span>ActionAmp</span>
        </Link>
        <div className="aa-admin-rail__title">Admin</div>
        <nav className="aa-admin-nav" aria-label="Admin">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `aa-admin-nav__item${isActive ? " active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="aa-admin-rail__footer">
          <span>Internal workspace</span>
          <span>{user.fullName}</span>
        </div>
      </aside>
      <div className="aa-admin-main">
        <header className="aa-admin-mobile-head">
          <Link className="aa-admin-mobile-brand" to="/app">
            <span className="aa-admin-brand__mark"><BrandMark size="sm" /></span>
            <span>Admin</span>
          </Link>
          <Link className="aa-admin-back" to="/app">Back to Next</Link>
        </header>
        <nav className="aa-admin-mobile-nav" aria-label="Admin">
          {NAV.map((item) => {
            const active = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return <Link key={item.to} className={active ? "active" : ""} to={item.to}>{item.label}</Link>;
          })}
        </nav>
        <main className="aa-admin-content">{children}</main>
      </div>
    </div>
  );
}
