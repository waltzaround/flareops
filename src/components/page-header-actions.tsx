import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Keep page-specific actions alongside the shared header controls. */
export function PageHeaderActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setTarget(document.getElementById("page-header-actions"));
  }, []);
  return target ? createPortal(children, target) : null;
}
