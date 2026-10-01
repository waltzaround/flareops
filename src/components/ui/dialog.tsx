import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
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
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          className={`${sheet ? "sheet" : "dialog"} ${className}`}
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
