// Runs before every dashboard build: syncs the Mac agent into public/agents and writes
// public/agents/version.json, which installed agents poll to update themselves.
// Version = sha256 over the files (each followed by a NUL byte), first 12 hex chars —
// must match _files_version() in agent_mac.py.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "agents");
const backend = join(root, "..", "backend", "agent");
const FILES = ["agent_mac.py", "edr_engine.py"];

for (const f of FILES) {
  // backend/ is the source of truth locally; on Vercel only public/ exists, so keep it.
  if (existsSync(join(backend, f))) copyFileSync(join(backend, f), join(out, f));
}

const version = createHash("sha256");
const files = {};
for (const f of FILES) {
  const buf = readFileSync(join(out, f));
  files[f] = createHash("sha256").update(buf).digest("hex");
  version.update(buf).update(Buffer.from([0]));
}
const manifest = { version: version.digest("hex").slice(0, 12), files, built_at: new Date().toISOString() };
writeFileSync(join(out, "version.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`agent manifest ${manifest.version}`);
