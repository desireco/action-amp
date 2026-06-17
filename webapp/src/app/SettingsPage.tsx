import { useAuth, logout } from "wasp/client/auth";
import { SettingsLayout } from "./SettingsLayout";

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
      <section className="aa-account-section">
        <h2 className="aa-account-label">Email</h2>
        <p className="aa-account-value">{email ?? "—"}</p>

        <h2 className="aa-account-label" style={{ marginTop: 16 }}>Name</h2>
        <p className="aa-account-value">{user ? `${user.firstName} ${user.lastName}` : ""}</p>
      </section>

      {/* Sign out */}
      <section className="aa-account-section">
        <button type="button" className="aa-account-logout" onClick={() => logout()}>
          Log out
        </button>
      </section>

      {/* Coming soon — kept quiet */}
      <section className="aa-account-section">
        <p className="aa-account-soon">
          Change email, change password, and delete account are coming soon.
        </p>
      </section>
    </SettingsLayout>
  );
}
