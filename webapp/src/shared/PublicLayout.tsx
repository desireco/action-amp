import type { ReactNode } from "react";
import { Link } from "react-router";
import "./PublicLayout.css";

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="aa-public">
      <nav className="aa-pub-nav">
        <Link to="/" className="aa-brand">
          <span className="aa-brand-mark">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M3.5 8.5l3 3 6-7"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="aa-brand-name">ActionAmp</span>
        </Link>
        <Link to="/" className="aa-pub-back">
          ← Home
        </Link>
      </nav>

      <main className="aa-pub-main">{children}</main>

      <footer className="aa-pub-footer">
        <div className="aa-pub-footer-inner">
          <Link to="/" className="aa-brand">
            <span className="aa-brand-mark aa-brand-mark-sm">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3.5 8.5l3 3 6-7"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="aa-brand-name aa-brand-name-sm">ActionAmp</span>
          </Link>
          <div className="aa-pub-footer-links">
            <a href="https://actionamp.com/about">About</a>
            <a href="https://actionamp.com/privacy">Privacy</a>
            <a href="https://actionamp.com/terms">Terms</a>
            <a href="https://actionamp.com/roadmap">Roadmap</a>
            <Link to="/founding-100">Founding 100</Link>
          </div>
          <div className="aa-pub-copy">
            © 2026 ActionAmp · Proudly built by{" "}
            <a href="https://dakic.com">Dakic</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
