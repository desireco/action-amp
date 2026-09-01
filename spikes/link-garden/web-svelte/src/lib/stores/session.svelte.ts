import { getSessionUser, signIn, signUp, type SessionUser } from "../api";

/** Auth state + the sign-up / sign-in flow. */
class SessionStore {
  user = $state<SessionUser | null>(null);
  mode = $state<"signup" | "signin">("signup");
  name = $state("");
  email = $state("");
  password = $state("");
  error = $state("");
  busy = $state(false);

  async init() {
    this.user = await getSessionUser();
  }

  async submit() {
    this.error = "";
    this.busy = true;
    try {
      if (this.mode === "signup") await signUp(this.name, this.email, this.password);
      else await signIn(this.email, this.password);
      this.user = await getSessionUser();
      if (!this.user) this.error = "no session after auth";
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.busy = false;
  }

  toggleMode() {
    this.mode = this.mode === "signup" ? "signin" : "signup";
  }
}

export const session = new SessionStore();
