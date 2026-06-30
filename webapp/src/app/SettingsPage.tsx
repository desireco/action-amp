import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth, logout } from "wasp/client/auth";
import { Button, ConfirmDialog } from "../components/ui";
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
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);

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
          <Button variant="secondary" size="sm" onClick={() => setConfirmLogout(true)}>
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
