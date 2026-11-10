// V-02: Excel dışa aktarım sayfalaması — sunucu satır sınırı olsa bile eksiksiz ve dürüst
import { fetchAllPages } from "../../src/lib/paginate.ts";

let failures = 0;
const check = (name, ok, more = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${more ? ` — ${more}` : ""}`); if (!ok) failures++; };

// PostgREST taklidi: istenen aralığı verir ama en fazla maxRows satır döndürür (sessiz kesme)
function server(total, maxRows = 1000) {
  const calls = [];
  const fetchPage = async (from, to) => {
    calls.push([from, to]);
    const end = Math.min(to, from + maxRows - 1, total - 1);
    const rows = [];
    for (let i = from; i <= end; i++) rows.push({ id: `p${i}` });
    return { rows, total };
  };
  return { fetchPage, calls };
}

for (const [total, limit] of [[0, 1000], [1, 1000], [999, 1000], [1000, 1000], [1001, 1000], [2000, 1000], [5000, 1000], [5001, 1000], [12000, 1000], [5001, 500], [3000, 100]]) {
  const s = server(total, limit);
  const r = await fetchAllPages(s.fetchPage);
  const ids = new Set(r.rows.map((x) => x.id));
  check(`${total} kayıt, sunucu sınırı ${limit}: hepsi geldi, tekrar yok`, r.rows.length === total && ids.size === total && !r.truncated && r.total === total, `${r.rows.length} satır, ${s.calls.length} istek`);
}

// Eski davranış (tek istek, 5000 istenir, sunucu 1000 verir) eksik kalırdı — yeni yöntem kalmaz
const legacy = server(5001, 1000);
const legacyRows = (await legacy.fetchPage(0, 4999)).rows;
check("eski tek-istek yöntemi 5001 kayıttan yalnızca 1000'ini alırdı (sorunun kanıtı)", legacyRows.length === 1000);

// Üst sınır: 25.000 kayıtta sessizce kesmez, truncated bildirir
const big = server(25000);
const capped = await fetchAllPages(big.fetchPage, { maxRows: 20000 });
check("üst sınırı aşan veri truncated olarak bildirilir", capped.rows.length === 20000 && capped.truncated && capped.total === 25000, `${capped.rows.length}/${capped.total}`);

// Tekrar eden satırlar (okuma sırasında kayıt kayması) ayıklanır
let n = 0;
const dup = await fetchAllPages(async (from) => {
  n++;
  if (n === 1) return { rows: Array.from({ length: 3 }, (_, i) => ({ id: `d${i}` })), total: 6 };
  if (n === 2) return { rows: Array.from({ length: 3 }, (_, i) => ({ id: `d${i + 2}` })), total: 6 }; // d2 tekrar
  return { rows: [], total: 6 };
});
check("tekrar eden satır ayıklanır ve eksik kalan dürüstçe bildirilir", dup.rows.length === 5 && dup.truncated, `${dup.rows.length}/${dup.total}`);

// Sonsuz döngü yok: sunucu hep boş döndürürse biter
const empty = await fetchAllPages(async () => ({ rows: [], total: 10 }));
check("boş yanıtta sonsuz döngüye girmez ve truncated bildirir", empty.rows.length === 0 && empty.truncated);

// Bellek: istek sayısı makul
const reqs = server(12000);
await fetchAllPages(reqs.fetchPage);
check("12.000 kayıt 12 istekte okunur", reqs.calls.length === 12, `${reqs.calls.length} istek`);

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
