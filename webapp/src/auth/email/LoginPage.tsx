import {
  PasswordlessAuthPage,
  type PasswordlessAuthDeps,
} from "./PasswordlessAuthPage";

type LoginPageProps = {
  /** Test seam — forwarded to PasswordlessAuthPage (see its deps docs). */
  deps?: Partial<PasswordlessAuthDeps>;
};

export function LoginPage({ deps }: LoginPageProps) {
  return (
    <PasswordlessAuthPage
      mode="login"
      showDevAutologin
      deps={deps}
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
