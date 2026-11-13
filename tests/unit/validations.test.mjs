// Form şemaları (Zod 4): kurallar, özel Türkçe mesajlar, coerce davranışı, Türkçe varsayılan hata metinleri
import crypto from "node:crypto";
import { vehicleSchema } from "../../src/lib/validations/vehicle.ts";
import { personnelSchema } from "../../src/lib/validations/work-plan.ts";
import { inventoryMaterialSchema, inventoryMovementSchema } from "../../src/lib/validations/inventory.ts";
import { projectSchema, loginSchema, updatePasswordSchema } from "../../src/lib/validations/project.ts";
import { registerSchema } from "../../src/lib/validations/auth.ts";

let failures = 0;
const check = (name, ok, more = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${more ? ` — ${more}` : ""}`); if (!ok) failures++; };
const msgs = (result) => (result.success ? [] : result.error.issues.map((i) => i.message));
const has = (result, text) => msgs(result).some((m) => m.includes(text));

// --- Araç ----------------------------------------------------------------------------------------------
const vehicle = { plate: "34 ABC 123", brand: "Ford", model: "Transit", current_km: "12000", monthly_rent: "0", inspection_date: "", insurance_date: "", notes: "" };
const v = vehicleSchema.safeParse(vehicle);
check("araç: geçerli kayıt, metin sayıya çevrilir (coerce)", v.success && v.data.current_km === 12000 && v.data.monthly_rent === 0, JSON.stringify(msgs(v)));
check("araç: kısa plaka özel mesajı", has(vehicleSchema.safeParse({ ...vehicle, plate: "34A" }), "Plaka en az 5 karakter"));
check("araç: ondalık km tam sayı mesajı", has(vehicleSchema.safeParse({ ...vehicle, current_km: "12.5" }), "Kilometre tam sayı olmalı"));
check("araç: negatif km reddedilir", has(vehicleSchema.safeParse({ ...vehicle, current_km: "-1" }), "Kilometre negatif olamaz"));
const nan = vehicleSchema.safeParse({ ...vehicle, current_km: "abc" });
check("araç: sayı olmayan değer reddedilir ve mesaj Türkçe (İngilizce 'Expected/Invalid input' yok)", !nan.success && msgs(nan).every((m) => !/expected|invalid input|received/i.test(m)), msgs(nan).join(" | "));
check("araç: boş km 0 sayılır (formun eski davranışı)", vehicleSchema.safeParse({ ...vehicle, current_km: "" }).success);
check("araç: model boşsa reddedilir", !vehicleSchema.safeParse({ ...vehicle, model: "  " }).success);

// --- Personel --------------------------------------------------------------------------------------------
const person = { full_name: "Veli Usta", job_title: "", phone: "", tc_identity_number: "12345678901", employment_start_date: "2026-01-01", employment_end_date: "", monthly_salary: "30000", is_active: true, notes: "", subcontractor_id: "", share_percent: "", sub_iban: "", sub_tax_number: "" };
const p = personnelSchema.safeParse(person);
check("personel: geçerli kayıt, maaş sayıya çevrilir", p.success && p.data.monthly_salary === 30000, JSON.stringify(msgs(p)));
check("personel: TC 10 haneli reddedilir", has(personnelSchema.safeParse({ ...person, tc_identity_number: "1234567890" }), "11 rakam"));
check("personel: TC boş olabilir", personnelSchema.safeParse({ ...person, tc_identity_number: "" }).success);
check("personel: aktif personelde ayrılış tarihi olamaz (superRefine)", has(personnelSchema.safeParse({ ...person, employment_end_date: "2026-05-01" }), "Aktif personelde işten ayrılış"));
check("personel: ayrılış, girişten önce olamaz", has(personnelSchema.safeParse({ ...person, is_active: false, employment_end_date: "2025-12-31" }), "Ayrılış tarihi işe giriş"));
check("personel: pasif + geçerli ayrılış tarihi geçer", personnelSchema.safeParse({ ...person, is_active: false, employment_end_date: "2026-06-01" }).success);
check("personel: negatif maaş reddedilir", has(personnelSchema.safeParse({ ...person, monthly_salary: "-5" }), "Maaş negatif olamaz"));
const longName = personnelSchema.safeParse({ ...person, full_name: "x".repeat(121) });
check("personel: 121 karakterlik ad reddedilir ve mesaj Türkçe", !longName.success && msgs(longName).every((m) => !/too big|expected|invalid/i.test(m)), msgs(longName).join(" | "));

// --- Stok ----------------------------------------------------------------------------------------------------------
const id = crypto.randomUUID();
const material = { material_name: "Kablo", material_code: "", category_id: id, unit: "meter", initial_quantity: "10.5", receipt_date: "2026-11-10", received_by: "Ali Veli", dispatch_number: "A-1", notes: "" };
check("stok: geçerli malzeme (metre, ondalık)", inventoryMaterialSchema.safeParse(material).success);
check("stok: adet cinsinde ondalık reddedilir", has(inventoryMaterialSchema.safeParse({ ...material, unit: "piece" }), "Adet miktarı tam sayı"));
check("stok: sıfır miktar reddedilir", has(inventoryMaterialSchema.safeParse({ ...material, initial_quantity: "0" }), "Miktar sıfırdan büyük"));
check("stok: geçersiz tarih reddedilir", has(inventoryMaterialSchema.safeParse({ ...material, receipt_date: "10/11/2026" }), "Giriş tarihi zorunlu"));
check("stok: kategori null olabilir", inventoryMaterialSchema.safeParse({ ...material, category_id: null }).success);
check("stok: veritabanının ürettiği (v4) UUID kabul edilir", inventoryMovementSchema.safeParse({ quantity: "2", location_id: id, project_name: "", project_code: "", team_personnel_ids: [id, crypto.randomUUID()], description: "" }).success);
check("stok: bozuk UUID reddedilir", !inventoryMovementSchema.safeParse({ quantity: "2", location_id: "abc", team_personnel_ids: [] }).success);

// --- Proje ve kimlik doğrulama -------------------------------------------------------------------------------------------------
const project = { project_code: "P-1", name: "Altyapı", project_type_id: id, location: "Ankara", team_name: "", description: "", image_url: "", received_at: "", start_date: "2026-01-01", estimated_end_date: "2026-02-01", project_date: "", priority_order: "" };
check("proje: geçerli kayıt", projectSchema.safeParse(project).success);
check("proje: tür seçilmediyse özel mesaj", has(projectSchema.safeParse({ ...project, project_type_id: "" }), "Proje türü seçin"));
check("proje: bitiş başlangıçtan önce olamaz", has(projectSchema.safeParse({ ...project, estimated_end_date: "2025-12-01" }), "Planlanan bitiş"));
check("proje: görsel bağlantısı http(s) olmalı", has(projectSchema.safeParse({ ...project, image_url: "ftp://x" }), "http(s)"));
check("proje: öncelik sayı olmalı", has(projectSchema.safeParse({ ...project, priority_order: "abc" }), "Öncelik"));
const out = projectSchema.safeParse({ ...project, team_name: undefined });
check("proje: isteğe bağlı alan boş metne dönüşür (transform)", out.success && out.data.team_name === "");
check("giriş: geçersiz e-posta özel mesajı", has(loginSchema.safeParse({ email: "x", password: "123456" }), "Geçerli bir e-posta girin"));
check("giriş: geçerli e-posta ve şifre", loginSchema.safeParse({ email: "a@b.com", password: "123456" }).success);
check("giriş: kısa şifre", has(loginSchema.safeParse({ email: "a@b.com", password: "123" }), "Şifre en az 6"));
check("yeni şifre: eşleşmezse hata ilgili alanda", (() => { const r = updatePasswordSchema.safeParse({ password: "abcdefgh", confirmPassword: "abcdefgx" }); return !r.success && r.error.issues[0].path[0] === "confirmPassword" && r.error.issues[0].message === "Şifreler eşleşmiyor"; })());
check("kayıt: boş form reddedilir (şema yüklenir, çökmez)", !registerSchema.safeParse({}).success);

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
