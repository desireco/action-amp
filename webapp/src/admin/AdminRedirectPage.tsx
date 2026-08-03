import { Navigate } from "react-router";

export function AdminRedirectPage() {
  return <Navigate to="/app/admin/overview" replace />;
}
