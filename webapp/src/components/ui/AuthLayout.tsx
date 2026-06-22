import type { ReactNode } from "react";
import "./AuthLayout.css";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * AuthLayout — full-screen calm stage wrapping a single centered card.
 *
 * Role: the shell for every authentication screen (login, signup, email
 * verification, password reset). Renders the brand mark, an on-voice headline,
 * the auth form body, and optional footer links.
 *
 * When to use: ONLY for unauthenticated entry screens that need a focused,
 * single-card layout. For authenticated app surfaces use the app shell
 * (AppShell.tsx); for modal flows use BottomSheet / overlay patterns.
 *
 * Children must be a Wasp auth form (LoginForm, SignupForm, …) themed via
 * `aaAuthAppearance` (../appearance). The Wasp form overrides live in
 * AuthLayout.css, scoped to `.aa-auth-card`.
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
