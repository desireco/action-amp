import { Link } from "react-router";
import { LoginForm } from "wasp/client/auth";
import { AuthLayout } from "../../components/ui";
import { aaAuthAppearance } from "../appearance";

export function LoginPage() {
  return (
    <AuthLayout
      title="Welcome back."
      subtitle="Pick up where you left off."
      footer={
        <>
          <span>
            New to ActionAmp? <Link to="/signup">Make an account</Link>
          </span>
          <span>
            Forgot your password?{" "}
            <Link to="/request-password-reset">Reset it</Link>
          </span>
        </>
      }
    >
      <LoginForm {...aaAuthAppearance} />
    </AuthLayout>
  );
}
