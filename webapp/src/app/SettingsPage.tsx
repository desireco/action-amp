import { useAuth, logout } from "wasp/client/auth";
import { Button } from "../components/ui";
import { SettingsLayout } from "./SettingsLayout";
import { Field } from "./Field";
import "./Field.css";

/**
 * Account — who you are, and how to leave.
 * Minimal on purpose. More controls arrive when their features ship.
 */
export function SettingsPage() {
  const { data: user } = useAuth();
  const email = user?.identities?.email?.id ?? null;

  return (
    <SettingsLayout>
      {/* Profile */}
      <section className="aa-settings-section">
      <Field label="Name" value={user ? user.fullName : ""} />
      <Field label="Email" value={email ?? "—"} />
      <Field
        label="Call me"
        value={(user && (user.preferredName || user.firstName)) || "—"}
      />
      </section>

      {/* Sign out */}
      <section className="aa-settings-section">
        <Field label="Session">
          <Button variant="secondary" size="sm" onClick={() => logout()}>
            Log out
          </Button>
        </Field>
      </section>

      {/* Coming soon — kept quiet */}
      <section className="aa-settings-section">
        <p className="aa-settings-note">
          Change email, change password, and delete account are coming soon.
        </p>
      </section>
    </SettingsLayout>
  );
}
