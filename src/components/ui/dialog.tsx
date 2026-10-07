import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  sheet = false,
  className = "",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  sheet?: boolean;
  className?: string;
}) {
  // These controlled dialogs are opened from many controls, without a Radix Trigger.
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) {
      opener.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }
  }, [open]);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          className={`${sheet ? "sheet" : "dialog"} ${className}`}
          onCloseAutoFocus={(event) => {
            if (opener.current?.isConnected) {
              event.preventDefault();
              opener.current.focus({ preventScroll: true });
            }
          }}
        >
          <div className="dialog-heading">
            <div>
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description>
                {description ??
                  "Review details in your current Cloudflare workspace."}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              className="button button-ghost button-icon"
              aria-label="Close"
            >
              <X size={17} />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
