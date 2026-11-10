// Birim testleri (veritabanı gerektirmeyen): npm run test:unit
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(here).filter((f) => f.endsWith(".test.mjs")).sort();
let failed = 0;
let checks = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", path.join(here, file)], { encoding: "utf8" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const passed = (out.match(/^ok {2}/gm) ?? []).length;
  const bad = out.split("\n").filter((l) => /^(FAIL|CRASH)\b/.test(l));
  checks += passed;
  const ok = r.status === 0 && !bad.length;
  console.log(`${ok ? "✓" : "✗"} ${file.padEnd(32)} ${String(passed).padStart(3)} kontrol`);
  if (!ok) { failed++; console.log(out.split("\n").filter((l) => !l.startsWith("ok  ")).join("\n").replace(/^/gm, "    ")); }
}
console.log(`\n${files.length - failed}/${files.length} dosya geçti · ${checks} kontrol`);
process.exit(failed ? 1 : 0);
