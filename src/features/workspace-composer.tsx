import { useState } from "react";
import { ArrowUp, ChevronDown, Plus, ShieldCheck } from "lucide-react";
import { useUI } from "../lib/store";
import type { Discovery } from "../lib/types";
export function WorkspaceComposer({
  onCommand,
}: {
  onCommand: (d: Discovery) => void;
}) {
  const { account, mode, setPalette } = useUI();
  const [value, setValue] = useState("");
  function submit() {
    if (!value.trim()) return;
    onCommand({ command: "", fullPath: [], description: value.trim() });
    setValue("");
  }
  return (
    <div className="workspace-composer-wrap">
      <div className="workspace-composer">
        <textarea
          rows={2}
          aria-label="Describe a Cloudflare task"
          placeholder="What would you like to do in Cloudflare?"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="workspace-composer-tools">
          <button
            className="composer-add"
            title="Search resources and commands"
            aria-label="Search resources and commands"
            onClick={() => setPalette(true)}
          >
            <Plus size={21} />
          </button>
          <span className="composer-review">
            <ShieldCheck size={15} />
            Review before running
          </span>
          <div className="composer-tools-spacer" />
          <button
            className="composer-profile"
            title="Find resources in this account"
            onClick={() => setPalette(true)}
          >
            {account.profile}
            <ChevronDown size={13} />
          </button>
          <button
            className="composer-send"
            aria-label="Find Cloudflare command"
            disabled={!value.trim()}
            onClick={submit}
          >
            <ArrowUp size={19} />
          </button>
        </div>
      </div>
      <div className="composer-context">
        {account.name}
        {mode === "demo" ? " · Demo workspace" : ""}
      </div>
    </div>
  );
}
