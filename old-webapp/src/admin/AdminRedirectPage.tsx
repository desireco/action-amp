import { Navigate } from "react-router";

export function AdminRedirectPage() {
  return <Navigate to="/do/admin/overview" replace />;
}
