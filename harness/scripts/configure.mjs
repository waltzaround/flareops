import { readFile, writeFile } from "node:fs/promises";
const [accountId] = process.argv.slice(2);
if (!/^[a-f0-9]{32}$/i.test(accountId || "")) throw new Error("Usage: node scripts/configure.mjs <Cloudflare account ID>");
const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
config.account_id = accountId;
config.vars.ACCOUNT_ID = accountId;
await writeFile(new URL("../wrangler.local.json", import.meta.url), JSON.stringify(config, null, 2) + "\n");
console.log("Created wrangler.local.json for the selected account. No deployment performed.");
