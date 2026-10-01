import "./tunnel-status.css";

const healthStates: Record<string, { label: string; tone: string }> = {
  healthy: { label: "Healthy", tone: "healthy" },
  degraded: { label: "Degraded", tone: "warning" },
  down: { label: "Down", tone: "danger" },
  inactive: { label: "Inactive", tone: "neutral" },
};

export function TunnelStatus({ status }: { status?: string }) {
  const value = status?.trim().toLowerCase() ?? "";
  const state = healthStates[value] ?? {
    label: value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unknown",
    tone: "neutral",
  };
  return (
    <span
      className={`tunnel-status tunnel-status--${state.tone}`}
      aria-label={`Tunnel health: ${state.label}`}
    >
      <span className="tunnel-status-dot" aria-hidden="true" />
      {state.label}
    </span>
  );
}
