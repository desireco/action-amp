import { ForgotPasswordForm } from "wasp/client/auth";
import { AuthLayout } from "../AuthLayout";
import { aaAuthAppearance } from "../appearance";

export function RequestPasswordResetPage() {
  return (
    <AuthLayout
      title="Reset your password."
      subtitle="We'll email you a link to set a new one."
    >
      <ForgotPasswordForm {...aaAuthAppearance} />
    </AuthLayout>
  );
}
