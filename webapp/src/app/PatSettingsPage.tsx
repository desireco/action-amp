import { useCallback, useEffect, useState } from "react";
import { SettingsLayout } from "./SettingsLayout";
import { Field } from "./Field";
import { Button, ConfirmDialog } from "../components/ui";
import "./Field.css";
import "./PatSettingsPage.css";

// The API origin (Express on :3001 in dev, same-origin in prod). Same env var
// Wasp's own client reads (`wasp/client/config` → `env["REACT_APP_API_URL"]`);
// inlined here because the generated server tsconfig can't resolve
// `wasp/client/config` from a client file. Vite injects this at build time.
const API_URL = (import.meta.env.REACT_APP_API_URL ?? "").replace(/\/$/, "");

/**
 * Access tokens (Personal Access Tokens) — for the ActionAmp CLI.
 *
 * A token authenticates `actionamp` against your account. Issue one here,
 * paste it into the CLI once, revoke it when you're done. The plaintext is
 * shown exactly once at issue time; we store only the hash.
 *
 * These routes are custom `api` routes (not Wasp operations), so we call them
 * with same-origin `fetch`. The browser's session cookie authenticates the
 * request — same as Wasp's own client does under the hood. See
 * docs/specs/cli-pat-plumbing.md.
 */

type PatKey = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type IssueResponse = {
  token: string;
  id: string;
  label: string;
  createdAt: string;
};

async function apiCall<T>(path: string, init?: RequestInit): Promise<T> {
  // `path` is a server route ("/api/pat/list"); prepend the configured API
  // origin because the client (Vite on :4000) and the API (Express on :3001 in
  // dev, same-origin in prod) are separate in dev. The session cookie is sent
  // because Wasp's session-cookie auth is cross-origin friendly (SameSite=Lax
  // + the API's CORS allows the client origin).
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (body as { error?: string }).error ?? `Request failed (${res.status}).`;
    throw new Error(message);
  }
  return body as T;
}

function formatLastUsed(iso: string | null): string {
  if (!iso) return "Never used";
  const then = new Date(iso).getTime();
  const ago = Date.now() - then;
  const mins = Math.floor(ago / 60000);
  if (mins < 1) return "Used just now";
  if (mins < 60) return `Used ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Used ${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Used ${days} day${days === 1 ? "" : "s"} ago`;
  // Older than 30 days → absolute date. Calm format, no time.
  return `Used ${new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })}`;
}

export function PatSettingsPage() {
  const [keys, setKeys] = useState<PatKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssueResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const data = await apiCall<{ keys?: PatKey[] }>("/api/pat/list");
      setKeys(Array.isArray(data.keys) ? data.keys : []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not load tokens.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleIssue() {
    setIssuing(true);
    setIssueError(null);
    setIssued(null);
    setCopied(false);
    try {
      const res = await apiCall<IssueResponse>("/api/pat/issue", {
        method: "POST",
        body: JSON.stringify({ label }),
      });
      setIssued(res);
      setLabel("");
      await refresh();
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : "Could not issue token.");
    } finally {
      setIssuing(false);
    }
  }

  async function copyToken() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.token);
      setCopied(true);
    } catch {
      // clipboard API can be unavailable (insecure context). The token is still
      // visible in the input for manual copy.
      setCopied(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevoking(true);
    try {
      await apiCall("/api/pat/revoke", { method: "POST", body: JSON.stringify({ id }) });
      setRevokeId(null);
      await refresh();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not revoke token.");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <SettingsLayout>
      <section className="aa-settings-section">
        <div className="aa-settings-section-head">
          <h2 className="aa-settings-sh">Access tokens</h2>
          <p className="aa-settings-note">
            For the ActionAmp CLI. A token authenticates <code>actionamp</code> against
            your account — paste it in once. The plaintext is shown only at issue;
            we store the hash.
          </p>
        </div>

        {/* Issue form */}
        <form
          className="aa-pat-issue"
          onSubmit={(e) => {
            e.preventDefault();
            void handleIssue();
          }}
        >
          <input
            className="aa-settings-input aa-pat-issue__input"
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setIssueError(null);
            }}
            placeholder="Label this token (e.g. laptop, ci)"
            maxLength={80}
            disabled={issuing}
            autoComplete="off"
          />
          <Button type="submit" variant="secondary" size="sm" disabled={!label.trim() || issuing}>
            {issuing ? "Issuing" : "Issue token"}
          </Button>
        </form>
        {issueError && <p className="aa-settings-error">{issueError}</p>}

        {/* Issued-once reveal */}
        {issued && (
          <div className="aa-pat-reveal">
            <p className="aa-pat-reveal__warning">
              Copy this token now. It will not be shown again.
            </p>
            <div className="aa-pat-reveal__row">
              <input
                className="aa-settings-input aa-pat-reveal__token"
                type="text"
                value={issued.token}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                aria-label={`New token ${issued.label}`}
              />
              <Button variant="secondary" size="sm" onClick={() => void copyToken()}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIssued(null);
                setCopied(false);
              }}
            >
              Done
            </Button>
          </div>
        )}

        {/* Existing keys */}
        {loading ? (
          <p className="aa-settings-note">Loading tokens…</p>
        ) : listError ? (
          <p className="aa-settings-error">{listError}</p>
        ) : keys.length === 0 ? (
          <p className="aa-settings-note">No tokens yet.</p>
        ) : (
          <div className="aa-pat-list">
            {keys.map((key) => (
              <Field
                key={key.id}
                label={key.label}
                description={formatLastUsed(key.lastUsedAt)}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRevokeId(key.id)}
                  aria-label={`Revoke token ${key.label}`}
                >
                  Revoke
                </Button>
              </Field>
            ))}
          </div>
        )}
      </section>

      {revokeId && (
        <ConfirmDialog
          title="Revoke this token?"
          message="Anything using this token will stop working immediately. You can issue a new one any time."
          confirmLabel="Revoke"
          cancelLabel="Keep"
          danger
          onConfirm={() => void handleRevoke(revokeId)}
          onClose={() => !revoking && setRevokeId(null)}
        />
      )}
    </SettingsLayout>
  );
}
