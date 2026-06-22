import { Link } from "react-router";
import { SignupForm } from "wasp/client/auth";
import { AuthLayout } from "../AuthLayout";
import { aaAuthAppearance } from "../appearance";

export function SignupPage() {
  return (
    <AuthLayout
      title="Make a start."
      subtitle="Capture less. Do more."
      footer={
        <span>
          Already have an account? <Link to="/login">Log in</Link>
        </span>
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
