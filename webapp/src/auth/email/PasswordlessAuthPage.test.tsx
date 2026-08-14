import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type UseAuthReturn = {
  data: { id: string; fullName: string } | null;
  status: "loading" | "success" | "error";
};

let mockUseAuthReturn: UseAuthReturn = { data: null, status: "success" };
const requestMagicLogin = vi.fn();
const verifyMagicLogin = vi.fn();

vi.mock("wasp/client/auth", () => ({
  useAuth: () => mockUseAuthReturn,
  login: vi.fn(),
}));

vi.mock("wasp/client/api", () => ({
  setSessionId: vi.fn(),
}));

vi.mock("wasp/client/operations", () => ({
  prepareDevAutologin: vi.fn(),
  requestMagicLogin: (...args: unknown[]) => requestMagicLogin(...args),
  verifyMagicLogin: (...args: unknown[]) => verifyMagicLogin(...args),
}));

const { PasswordlessAuthPage } = await import("./PasswordlessAuthPage");

function AppMarker() {
  return <div data-testid="app-marker">app page</div>;
}

function renderPage(mode: "login" | "signup", initialPath = `/${mode}`) {
  const footer = mode === "signup" ? <span>Signup footer</span> : <span>Login footer</span>;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path={`/${mode}`}
            element={<PasswordlessAuthPage mode={mode} footer={footer} />}
          />
          <Route path="/do" element={<AppMarker />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PasswordlessAuthPage", () => {
  beforeEach(() => {
    mockUseAuthReturn = { data: null, status: "success" };
    requestMagicLogin.mockReset();
    verifyMagicLogin.mockReset();
  });

  it("frames signup as account creation without password or name fields", () => {
    renderPage("signup");

    expect(screen.getByRole("heading", { name: "Start free." })).toBeInTheDocument();
    expect(screen.getByText(/create your account/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByRole("button", { name: "Continue with email" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();
  });

  it("keeps login framing on the same passwordless flow", () => {
    renderPage("login");

    expect(screen.getByRole("heading", { name: "Welcome back." })).toBeInTheDocument();
    expect(screen.getByText("We’ll email a code. No password needed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email me a code" })).toBeInTheDocument();
  });

  it("requests a code and advances signup to the shared verification step", async () => {
    requestMagicLogin.mockResolvedValue({ sent: true });
    renderPage("signup");

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue with email" }));

    await waitFor(() => {
      expect(requestMagicLogin).toHaveBeenCalledWith({
        email: "new@example.com",
        returnTo: "/do",
      });
    });
    expect(screen.getByRole("heading", { name: "Enter your code." })).toBeInTheDocument();
    expect(screen.getByLabelText("Six-digit code")).toHaveAttribute("autocomplete", "one-time-code");
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
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
    mockUseAuthReturn = {
      data: { id: "u1", fullName: "Jake" },
      status: "success",
    };
    renderPage("signup");

    expect(screen.getByTestId("app-marker")).toBeInTheDocument();
  });
});
