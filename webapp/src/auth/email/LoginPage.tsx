import { PasswordlessAuthPage } from "./PasswordlessAuthPage";

export function LoginPage() {
  return (
    <PasswordlessAuthPage
      mode="login"
      showDevAutologin
      footer={
        <>
          <span>
            See our <a href="https://actionamp.com/terms">Terms</a> and{" "}
            <a href="https://actionamp.com/privacy">Privacy Policy</a>.
          </span>
          <span className="aa-auth-version">v{__APP_VERSION__}</span>
        </>
      }
    />
  );
}
