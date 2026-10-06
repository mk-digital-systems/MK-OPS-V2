// Bütün veritabanı testlerini sırayla ayrı süreçlerde çalıştırır: npm run test:db
// Bir dosyayı tek başına çalıştırmak için: node tests/db/hakedis.test.mjs
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const files = fs
  .readdirSync(here)
  .filter((file) => file.endsWith(".test.mjs"))
  .filter((file) => !only.length || only.some((name) => file.startsWith(name)))
  .sort();

let failed = 0;
let totalChecks = 0;
const started = Date.now();
for (const file of files) {
  const t0 = Date.now();
  const result = spawnSync(process.execPath, [path.join(here, file)], { encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const passed = (output.match(/^ok {2}/gm) ?? []).length;
  const failures = output.split("\n").filter((line) => /^(FAIL|CRASH)\b/.test(line) || /Error:/.test(line));
  const ok = result.status === 0 && !failures.length;
  totalChecks += passed;
  console.log(`${ok ? "✓" : "✗"} ${file.padEnd(24)} ${String(passed).padStart(3)} kontrol  ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
  if (!ok) {
    failed++;
    console.log(output.split("\n").filter((line) => !line.startsWith("ok  ")).join("\n").trim().replace(/^/gm, "    "));
  }
}
console.log(`\n${files.length - failed}/${files.length} dosya geçti · ${totalChecks} kontrol · ${((Date.now() - started) / 1000).toFixed(0)} sn`);
process.exit(failed ? 1 : 0);
