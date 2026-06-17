import type { ReactNode } from "react";
import "./auth.css";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * ActionAmp auth shell — a calm, centered card with the brand mark and a
 * direct, on-voice headline. Wraps Wasp's themed auth forms.
 */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="aa-auth">
      <div className="aa-auth-card">
        <div className="aa-auth-mark" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <path
              d="M3.5 8.5l3 3 6-7"
              stroke="white"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="aa-auth-title">{title}</h1>
        {subtitle && <p className="aa-auth-subtitle">{subtitle}</p>}
        {children}
        {footer && <div className="aa-auth-footer">{footer}</div>}
      </div>
    </div>
  );
}
