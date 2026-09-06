import { Navigate, useLocation } from "react-router";

/**
 * Legacy `/app` → `/do` redirect. The route prefix was renamed; old links
 * (sent emails, bookmarks, docs) keep working by forwarding the full path —
 * query and hash included — under the new prefix.
 */
export function LegacyAppRedirectPage() {
  const { pathname, search, hash } = useLocation();
  const target = `/do${pathname.slice("/app".length)}${search}${hash}`;
  return <Navigate to={target} replace />;
}
