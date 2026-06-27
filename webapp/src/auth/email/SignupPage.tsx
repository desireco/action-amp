import { Link } from "react-router";
import { SignupForm } from "wasp/client/auth";
import { AuthLayout } from "../../components/ui";
import { aaAuthAppearance } from "../appearance";
import { GoogleButton } from "../google/GoogleButton";

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
      <GoogleButton />
      <div className="aa-auth-or" aria-hidden="true">or with email</div>
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
