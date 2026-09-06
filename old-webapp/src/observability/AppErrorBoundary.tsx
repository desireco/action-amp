import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../components/ui/Button";
import { captureClientError } from "./clientErrorTracking";

type Props = { children: ReactNode };
type State = { failed: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureClientError(error, {
      kind: "react",
      componentStack: info.componentStack,
    });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="aa-fatal-error" role="alert">
        <p className="aa-fatal-error__eyebrow">ActionAmp paused</p>
        <h1>Something went wrong.</h1>
        <p>Your work is still saved. Reload the app to continue.</p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </main>
    );
  }
}
