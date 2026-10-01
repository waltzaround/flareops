import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query";
import App from "./app/App";
import "./app/styles.css";
import "./app/workspace.css";
class Boundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="fatal">
        <h1>Let’s reopen your workspace.</h1>
        <p>
          FlareOps encountered an unexpected interface error. Your Cloudflare
          resources have not been changed.
        </p>
        <button className="button" onClick={() => location.reload()}>
          Reload FlareOps
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Boundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </Boundary>
  </React.StrictMode>,
);
