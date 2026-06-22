import { Link } from "react-router";
import { ResetPasswordForm } from "wasp/client/auth";
import { AuthLayout } from "../../components/ui";
import { aaAuthAppearance } from "../appearance";

export function PasswordResetPage() {
  return (
    <AuthLayout
      title="Set a new password."
      footer={
        <span>
          Remembered it? <Link to="/login">Back to log in</Link>
        </span>
      }
    >
      <ResetPasswordForm {...aaAuthAppearance} />
    </AuthLayout>
  );
}
