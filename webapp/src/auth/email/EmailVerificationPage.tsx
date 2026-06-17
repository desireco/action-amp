import { Link } from "react-router";
import { VerifyEmailForm } from "wasp/client/auth";
import { AuthLayout } from "../AuthLayout";
import { aaAuthAppearance } from "../appearance";

export function EmailVerificationPage() {
  return (
    <AuthLayout
      title="Verify your email."
      subtitle="Check your inbox for the confirmation link."
      footer={
        <span>
          Already verified? <Link to="/login">Go to log in</Link>
        </span>
      }
    >
      <VerifyEmailForm {...aaAuthAppearance} />
    </AuthLayout>
  );
}
