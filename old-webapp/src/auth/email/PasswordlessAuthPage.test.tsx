import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// No module mocking: the ops the page calls are injected through its explicit
// `deps` seam (see PasswordlessAuthPage.tsx). The real useAuth() still runs
// under the QueryClientProvider; its value is ignored while deps.authData is set.
import {
  PasswordlessAuthPage,
  type PasswordlessAuthDeps,
} from "./PasswordlessAuthPage";

const requestMagicLogin = vi.fn(
  async (_args: { email: string; returnTo: string }) => ({ sent: true }),
);
const verifyMagicLogin = vi.fn(
  async (_args: { token: string } | { email: string; code: string }) => ({
    sessionId: "sess_test",
  }),
);
const setSessionId = vi.fn();
const anonymousAuth: PasswordlessAuthDeps["authData"] = {
  data: null,
  status: "success",
};

function AppMarker() {
  return <div data-testid="app-marker">app page</div>;
}

function renderPage(mode: "login" | "signup", initialPath = `/${mode}`) {
  const footer =
    mode === "signup" ? <span>Signup footer</span> : <span>Login footer</span>;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path={`/${mode}`}
            element={
              <PasswordlessAuthPage
                mode={mode}
                footer={footer}
                deps={{
                  authData: anonymousAuth,
                  requestMagicLogin,
                  verifyMagicLogin,
                  setSessionId,
                }}
              />
            }
          />
          <Route path="/do" element={<AppMarker />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PasswordlessAuthPage", () => {
  beforeEach(() => {
    requestMagicLogin.mockClear();
    verifyMagicLogin.mockClear();
    setSessionId.mockClear();
    requestMagicLogin.mockResolvedValue({ sent: true });
    verifyMagicLogin.mockResolvedValue({ sessionId: "sess_test" });
  });

  it("frames signup as account creation without password or name fields", () => {
    renderPage("signup");

    expect(
      screen.getByRole("heading", { name: "Start free." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/create your account/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(
      screen.getByRole("button", { name: "Continue with email" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();
  });

  it("keeps login framing on the same passwordless flow", () => {
    renderPage("login");

    expect(
      screen.getByRole("heading", { name: "Welcome back." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("We’ll email a code. No password needed."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Email me a code" }),
    ).toBeInTheDocument();
  });

  it("requests a code and advances signup to the shared verification step", async () => {
    requestMagicLogin.mockResolvedValue({ sent: true });
    renderPage("signup");

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with email" }),
    );

    await waitFor(() => {
      expect(requestMagicLogin).toHaveBeenCalledWith({
        email: "new@example.com",
        returnTo: "/do",
      });
    });
    expect(
      screen.getByRole("heading", { name: "Enter your code." }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Six-digit code")).toHaveAttribute(
      "autocomplete",
      "one-time-code",
    );
    expect(
      screen.getByRole("button", { name: "Continue" }),
    ).toBeInTheDocument();
  });

  it("preserves a safe purchase return path when requesting a code", async () => {
    requestMagicLogin.mockResolvedValue({ sent: true });
    renderPage("login", "/login?returnTo=%2Ffounding-100");

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "founder@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));

    await waitFor(() => {
      expect(requestMagicLogin).toHaveBeenCalledWith({
        email: "founder@example.com",
        returnTo: "/founding-100",
      });
    });
  });

  it("falls back to the app for an external return path", async () => {
    requestMagicLogin.mockResolvedValue({ sent: true });
    renderPage("login", "/login?returnTo=https%3A%2F%2Fevil.example");

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "safe@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));

    await waitFor(() => {
      expect(requestMagicLogin).toHaveBeenCalledWith({
        email: "safe@example.com",
        returnTo: "/do",
      });
    });
  });

  it("redirects either route when an authenticated session already exists", () => {
    anonymousAuth.data = { id: "u1" };
    try {
      renderPage("signup");

      expect(screen.getByTestId("app-marker")).toBeInTheDocument();
    } finally {
      anonymousAuth.data = null;
    }
  });
});
