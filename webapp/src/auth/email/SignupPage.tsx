import { Link } from "react-router";
import { PasswordlessAuthPage } from "./PasswordlessAuthPage";

export function SignupPage() {
  return (
    <PasswordlessAuthPage
      mode="signup"
      footer={
        <>
          <span>
            By creating an account, you agree to our{" "}
            <a href="https://actionamp.com/terms">Terms</a> and{" "}
            <a href="https://actionamp.com/privacy">Privacy Policy</a>.
          </span>
          <span>
            Already have an account? <Link to="/login">Log in</Link>
          </span>
          <span>
            Proudly built by <a href="https://dakic.com">Dakic</a>.
          </span>
        </>
      }
    />
  );
}
