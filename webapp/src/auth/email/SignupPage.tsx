import { Link } from "react-router";
import { SignupForm } from "wasp/client/auth";
import { AuthLayout } from "../../components/ui";
import { aaAuthAppearance } from "../appearance";
// GoogleButton import omitted while Google auth is disabled — see main.wasp.ts.

export function SignupPage() {
  return (
    <AuthLayout
      title="Make a start."
      subtitle="Capture less. Do more."
      footer={
        <>
          <span>
            By creating an account, you agree to our{" "}
            <Link to="/terms">Terms</Link> and{" "}
            <Link to="/privacy">Privacy Policy</Link>.
          </span>
          <span>
            Already have an account? <Link to="/login">Log in</Link>
          </span>
        </>
      }
    >
      <SignupForm
        {...aaAuthAppearance}
        additionalFields={[
          {
            name: "fullName",
            type: "input",
            label: "Full name",
            validations: {
              required: "Full name is required",
            },
          },
        ]}
      />
    </AuthLayout>
  );
}
