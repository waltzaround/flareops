import { useEffect, useState } from "react";
import { Cloud, CloudOff, ArrowRight } from "lucide-react";
import { z } from "zod";
import { Dialog } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { ErrorBox } from "../components/shared";
import { useUI } from "../lib/store";
import { formatCommand } from "../lib/cf";
import type { Resource, Request } from "../lib/types";
const formSchema = z.object({
  name: z.string().trim().min(1, "A record name is required."),
  content: z.string().trim().min(1, "Record content is required."),
  ttl: z
    .number()
    .int()
    .refine(
      (v) => v === 1 || v >= 60,
      "TTL must be automatic or at least 60 seconds.",
    ),
});
export function DnsSheet({
  open,
  record,
  onClose,
  onReview,
}: {
  open: boolean;
  record?: Resource;
  onClose: () => void;
  onReview: (r: Request) => void;
}) {
  const { account, zone } = useUI();
  const [type, setType] = useState("A"),
    [name, setName] = useState(""),
    [content, setContent] = useState(""),
    [proxied, setProxied] = useState(true),
    [ttl, setTtl] = useState(1),
    [error, setError] = useState(""),
    [priority, setPriority] = useState(10);
  useEffect(() => {
    if (open) {
      setType(record?.type ?? "A");
      setName(record?.name ?? "");
      setContent(record?.content ?? "");
      setProxied(record?.proxied ?? true);
      setTtl(record?.ttl ?? 1);
      setError("");
      setPriority(Number(record?.metadata?.priority ?? 10));
    }
  }, [open, record]);
  const proxyable = ["A", "AAAA", "CNAME"].includes(type);
  const request: Request = {
    path: ["dns", "records", record ? "edit" : "create"],
    context: { profile: account.profile, accountId: account.id, zoneId: zone },
    parameters: record ? { dns_record_id: record.id } : {},
    body: {
      type,
      name: name.trim(),
      content: content.trim(),
      proxied: proxyable && proxied,
      ttl,
      ...(type === "MX" ? { priority } : {}),
    },
  };
  function submit() {
    const valid = formSchema.safeParse({ name, content, ttl });
    if (!valid.success) {
      setError(valid.error.issues[0].message);
      return;
    }
    if (!zone) {
      setError("Select a zone first.");
      return;
    }
    if (
      type === "A" &&
      !z.string().ip({ version: "v4" }).safeParse(content).success
    ) {
      setError("Enter a valid IPv4 address.");
      return;
    }
    if (
      type === "AAAA" &&
      !z.string().ip({ version: "v6" }).safeParse(content).success
    ) {
      setError("Enter a valid IPv6 address.");
      return;
    }
    onReview(request);
    onClose();
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={record ? "Edit DNS record" : "Create DNS record"}
      description={`${account.name} · ${account.profile}`}
      sheet
    >
      <div className="dialog-body">
        <div className="notice">
          <Cloud size={16} />
          <span>Manage how traffic reaches your application.</span>
        </div>
        <div className="form-row">
          <label className="field">
            Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {["A", "AAAA", "CNAME", "TXT", "MX", "NS"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="field grow">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="api.example.com"
            />
          </label>
        </div>
        <label className="field">
          {type === "A"
            ? "IPv4 address"
            : type === "CNAME"
              ? "Target"
              : "Content"}
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={type === "A" ? "192.0.2.10" : "Record value"}
          />
        </label>
        {type === "MX" && (
          <label className="field">
            Priority
            <input
              type="number"
              min="0"
              max="65535"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
          </label>
        )}
        <label className="field">
          TTL
          <select value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
            <option value="1">Auto</option>
            <option value="60">1 minute</option>
            <option value="300">5 minutes</option>
            <option value="3600">1 hour</option>
            <option value="86400">1 day</option>
          </select>
        </label>
        <div className="proxy-control">
          <div>
            {proxyable && proxied ? (
              <Cloud size={22} />
            ) : (
              <CloudOff size={22} />
            )}
            <span>
              <strong>
                {proxyable && proxied
                  ? "Proxied through Cloudflare"
                  : "DNS only"}
              </strong>
              <small>
                {proxyable
                  ? "Protect and accelerate traffic through the edge."
                  : "This record type does not support proxying."}
              </small>
            </span>
          </div>
          <button
            role="switch"
            aria-label="Proxy through Cloudflare"
            aria-checked={proxyable && proxied}
            disabled={!proxyable}
            className={`switch ${proxyable && proxied ? "on" : ""}`}
            onClick={() => setProxied(!proxied)}
          >
            <span />
          </button>
        </div>
        <div className="section-label">COMMAND PREVIEW</div>
        <pre className="code-block">{formatCommand(request)}</pre>
        {error && <ErrorBox error={error} />}
      </div>
      <div className="dialog-footer">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="default" onClick={submit}>
          Review command
          <ArrowRight size={15} />
        </Button>
      </div>
    </Dialog>
  );
}
