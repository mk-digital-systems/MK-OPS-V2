// Veritabanı testleri için ortak düzenek: PGlite (WASM Postgres) üzerinde Supabase taklidi
// + supabase/migrations klasöründeki bütün migration'lar sırayla.
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, "../../supabase/migrations");

// Uygulama tarihleri İstanbul saatine göre hesaplar; testlerdeki current_date de öyle olsun.
// (CI sunucusu UTC çalışır; 21:00 UTC sonrası "bugün" farklı güne düşüyordu.)
const SESSION_DEFAULTS = `set search_path = "$user", public, extensions; set timezone = 'Europe/Istanbul';`;

/** Supabase taklidi kurulmuş boş veritabanı (auth şeması, roller, storage). */
export async function openDb() {
  const pg = new PGlite({ extensions: { pg_trgm, pgcrypto } });
  await pg.exec(fs.readFileSync(path.join(here, "supabase-stubs.sql"), "utf8"));
  await pg.exec(SESSION_DEFAULTS);
  return pg;
}

/** Bir migration dosyasını Supabase SQL Editor gibi ayrı oturumda çalıştırır. */
export async function applyFile(pg, file) {
  try {
    await pg.exec(fs.readFileSync(file, "utf8"));
    // Her SQL Editor çalıştırması yeni oturumdur; SET komutları sonraki dosyaya taşınmasın.
    await pg.exec(`reset all; ${SESSION_DEFAULTS}`);
  } catch (error) {
    const where = error.where ? `\n  where: ${error.where}` : "";
    throw new Error(`${path.basename(file)}: ${error.message}${where}`);
  }
}

/**
 * Klasördeki bütün .sql dosyalarını ada göre sırayla uygular; filtre verilirse yalnızca onları.
 * DRAFT_MIGRATION ortam değişkeni verilirse (henüz klasöre konmamış) taslak migration en sona eklenir:
 *   DRAFT_MIGRATION=/yol/taslak.sql npm run test:db
 */
export async function applyDir(pg, dir = MIGRATIONS_DIR, filter = () => true) {
  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".sql") && filter(file)).sort();
  for (const file of files) await applyFile(pg, path.join(dir, file));
  const draft = process.env.DRAFT_MIGRATION;
  if (draft && dir === MIGRATIONS_DIR && filter(path.basename(draft))) await applyFile(pg, path.resolve(draft));
  return files.length;
}
