import { Link } from "react-router";
import { LoginForm } from "wasp/client/auth";
import { AuthLayout } from "../../components/ui";
import { aaAuthAppearance } from "../appearance";
import { GoogleButton } from "../google/GoogleButton";

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
          <span>
            See our <Link to="/terms">Terms</Link> and{" "}
            <Link to="/privacy">Privacy Policy</Link>.
          </span>
        </>
      }
    >
      <GoogleButton />
      <div className="aa-auth-or" aria-hidden="true">or with email</div>
      <LoginForm {...aaAuthAppearance} />
    </AuthLayout>
  );
}
