import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useAuth, logout } from "wasp/client/auth";
import { updateProfile } from "wasp/client/operations";
import { Button, ConfirmDialog } from "../components/ui";
import { SettingsLayout } from "./SettingsLayout";
import { Field } from "./Field";
import "./Field.css";

/**
 * Account — who you are, and how to leave.
 * Minimal on purpose. More controls arrive when their features ship.
 */
export function SettingsPage() {
  const { data: user, refetch } = useAuth();
  const email = user?.identities?.email?.id ?? null;
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [fullName, setFullName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [profileStatus, setProfileStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setFullName(user.fullName ?? "");
    setPreferredName(user.preferredName || user.firstName || "");
  }, [user]);

  const profileChanged =
    !!user &&
    (fullName.trim() !== (user.fullName ?? "") ||
      preferredName.trim() !== (user.preferredName || user.firstName || ""));

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileStatus("saving");
    setProfileError(null);
    try {
      await updateProfile({ fullName, preferredName });
      await refetch();
      setProfileStatus("saved");
    } catch (err) {
      setProfileStatus("idle");
      setProfileError(err instanceof Error ? err.message : "Could not save profile.");
    }
  }

  return (
    <SettingsLayout>
      <section className="aa-settings-section">
        <div className="aa-settings-section-head">
          <h2 className="aa-settings-sh">Profile</h2>
          <p className="aa-settings-note">
            This name shows in the app shell and personalizes focus copy.
          </p>
        </div>
        <form className="aa-settings-form" onSubmit={saveProfile}>
          <Field label="Full name" description="Used for your account and avatar initials.">
            <input
              className="aa-settings-input"
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value);
                setProfileStatus("idle");
              }}
              autoComplete="name"
              disabled={!user || profileStatus === "saving"}
            />
          </Field>
          <Field label="Display name" description="Short name ActionAmp can use in calmer copy.">
            <input
              className="aa-settings-input"
              value={preferredName}
              onChange={(event) => {
                setPreferredName(event.target.value);
                setProfileStatus("idle");
              }}
              autoComplete="given-name"
              disabled={!user || profileStatus === "saving"}
            />
          </Field>
          <div className="aa-settings-actions">
            {profileError && <p className="aa-settings-error">{profileError}</p>}
            {profileStatus === "saved" && !profileChanged && (
              <p className="aa-settings-success">Saved.</p>
            )}
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={!profileChanged || profileStatus === "saving"}
            >
              {profileStatus === "saving" ? "Saving" : "Save changes"}
            </Button>
          </div>
        </form>
      </section>

      <section className="aa-settings-section">
        <div className="aa-settings-section-head">
          <h2 className="aa-settings-sh">Sign-in</h2>
          <p className="aa-settings-note">
            Email identifies the account. We send a fresh sign-in code when you log in.
          </p>
        </div>
        <Field label="Email address" description={email ? "Primary sign-in email." : "No email login attached."} value={email ?? "Not connected"} />
      </section>

      <section className="aa-settings-section">
        <div className="aa-settings-section-head">
          <h2 className="aa-settings-sh">Session</h2>
          <p className="aa-settings-note">End this browser session.</p>
        </div>
        <Field label="Signed in as" value={email ?? user?.fullName ?? "This account"}>
          <Button variant="secondary" size="sm" onClick={() => setConfirmLogout(true)}>
            Log out
          </Button>
        </Field>
      </section>

      <section className="aa-settings-section">
        <div className="aa-settings-section-head">
          <h2 className="aa-settings-sh">About</h2>
          <p className="aa-settings-note">
            Build identifier — useful when reporting an issue.
          </p>
        </div>
        <Field label="Version" value={__APP_VERSION__} />
        <Field
          label="Built by"
          value={<a href="https://dakic.com">Dakic</a>}
        />
      </section>

      {confirmLogout && (
        <ConfirmDialog
          title="Log out?"
          message="You'll be signed out and return to the home page."
          confirmLabel="Log out"
          cancelLabel="Stay"
          danger
          onConfirm={async () => {
            await logout();
            navigate("/");
          }}
          onClose={() => setConfirmLogout(false)}
        />
      )}
    </SettingsLayout>
  );
}
