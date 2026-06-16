import type { ReactNode } from "react";
import "./PublicLayout.css";

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="aa-public">
      <nav className="aa-pub-nav">
        <a href="/" className="aa-brand">
          <span className="aa-brand-mark">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="aa-brand-name">ActionAmp</span>
        </a>
        <a href="/" className="aa-pub-back">← Home</a>
      </nav>

      <main className="aa-pub-main">{children}</main>

      <footer className="aa-pub-footer">
        <div className="aa-brand">
          <span className="aa-brand-mark aa-brand-mark-sm">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="aa-brand-name aa-brand-name-sm">ActionAmp</span>
        </div>
        <div className="aa-pub-footer-links">
          <a href="/about">About</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </div>
        <div className="aa-pub-copy">© 2026 ActionAmp</div>
      </footer>
    </div>
  );
}
