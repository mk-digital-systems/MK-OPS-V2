// U-03: ilk kullanım rehberi — rol/izne göre adımlar, tamamlanma, kaybolma
import { buildSetupSteps, shouldShowSetupGuide } from "../../src/lib/setup-guide.ts";

let failures = 0;
const check = (name, ok, more = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${more ? ` — ${more}` : ""}`); if (!ok) failures++; };

const empty = { projects: 0, personnel: 0, vehicles: 0, work_plans: 0, attendance: 0 };
const all = ["projects", "personnel", "vehicles", "work_plans", "attendance", "inventory", "hakedis"];

let steps = buildSetupSteps(empty, all);
check("tam yetkili kullanıcı 5 adım görür, hiçbiri tamamlanmamış", steps.length === 5 && steps.every((s) => !s.done) && shouldShowSetupGuide(steps));
check("adım sırası: personel, araç, proje, iş planı, puantaj", steps.map((s) => s.key).join(",") === "personnel,vehicles,projects,work_plans,attendance");

steps = buildSetupSteps({ ...empty, personnel: 3, projects: 1 }, all);
check("veri girilen adımlar tamamlanır", steps.filter((s) => s.done).map((s) => s.key).sort().join(",") === "personnel,projects");
check("hâlâ eksik adım varsa rehber görünür", shouldShowSetupGuide(steps));

steps = buildSetupSteps({ projects: 1, personnel: 1, vehicles: 1, work_plans: 1, attendance: 1 }, all);
check("hepsi tamamlanınca rehber kaybolur", !shouldShowSetupGuide(steps));

// Muhasebe: yalnızca personel, araç, puantaj yazabilir (iş planı/proje yok)
steps = buildSetupSteps(empty, ["personnel", "vehicles", "attendance", "inventory"]);
check("muhasebe yalnızca yetkili modüllerin adımlarını görür", steps.map((s) => s.key).join(",") === "personnel,vehicles,attendance");

// Yetkisi olmayan rol: hiç adım yok → rehber gösterilmez
steps = buildSetupSteps(empty, []);
check("yazma yetkisi yoksa rehber gösterilmez", steps.length === 0 && !shouldShowSetupGuide(steps));
// Yetkisiz modülün verisi eksikse rehberi tetiklemez
steps = buildSetupSteps({ ...empty, personnel: 5, vehicles: 2, attendance: 9 }, ["personnel", "vehicles", "attendance"]);
check("yetkili olunan adımlar bittiyse, yetkisiz modüller rehberi açmaz", !shouldShowSetupGuide(steps));
// Eksik sayı alanı güvenli
check("eksik sayı alanı 0 sayılır", buildSetupSteps({}, ["projects"])[0].done === false);

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
