"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, FileSpreadsheet, FileText, Loader2, Pencil, Plus, Send, Tags, Trash2, Undo2, Warehouse } from "lucide-react";
import { toast } from "sonner";
import type { InventoryCatalog, InventoryCategory, InventoryLocation, InventoryMaterial, InventoryReceipt, InventoryShipment, InventoryUnit } from "@/types/inventory";
import type { Personnel } from "@/types/work-plan";
import { INVENTORY_UNITS, UNCATEGORIZED_LABEL, formatInventoryQuantity, getCategoryName, stockAt, totalStock } from "@/lib/constants/inventory";
import { downloadInventoryStockExcel, downloadInventoryStockPdf, getInventoryExportTitle } from "@/lib/inventory-export";
import { useReportBrand } from "@/components/layout/company-brand-provider";
import { createClient } from "@/lib/supabase/client";
import { InventoryRepository } from "@/modules/inventory/inventory-repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { InventoryRequest } from "@/types/inventory";
import { MaterialRequestsManager } from "@/components/inventory/material-requests-manager";

/** "all" = tüm depolar, aksi hâlde depo kimliği */
type StockView = "all" | string;
/** "all" = tüm kategoriler, "none" = kategorisiz, aksi hâlde kategori kimliği */
type CategoryFilter = "all" | "none" | string;
type Line = { material_id: string; quantity: string };
type ReceiptLine = { catalog_id: string; material_code: string; unit: InventoryUnit; quantity: string };
const today = () => new Date().toLocaleDateString("en-CA");
const LOCATION_COLORS = ["bg-emerald-600", "bg-blue-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-teal-600"];

export function InventoryManager({ initialMaterials, initialCatalogs, initialCategories, initialLocations, initialShipments, initialReceipts, initialRequests, personnel, readOnly = false }: {
  initialMaterials: InventoryMaterial[]; initialCatalogs: InventoryCatalog[]; initialCategories: InventoryCategory[]; initialLocations: InventoryLocation[];
  initialShipments: InventoryShipment[]; initialReceipts: InventoryReceipt[]; initialRequests: InventoryRequest[]; personnel: Personnel[]; readOnly?: boolean;
}) {
  const [materials, setMaterials] = useState(initialMaterials);
  const [catalogs, setCatalogs] = useState(initialCatalogs);
  const [categories, setCategories] = useState(initialCategories);
  const [locations, setLocations] = useState(initialLocations);
  const [shipments, setShipments] = useState(initialShipments);
  const [receipts, setReceipts] = useState(initialReceipts);
  const [stockView, setStockView] = useState<StockView>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [movement, setMovement] = useState<{ material: InventoryMaterial; locationId: string } | null>(null);
  const [deleteCatalogTarget, setDeleteCatalogTarget] = useState<InventoryCatalog | null>(null);
  const [deleteMaterialTarget, setDeleteMaterialTarget] = useState<InventoryMaterial | null>(null);
  const [undoShipmentTarget, setUndoShipmentTarget] = useState<InventoryShipment | null>(null);
  const [loading, setLoading] = useState(false);

  const viewLocation = locations.find((item) => item.id === stockView) ?? null;
  const quantityOf = (lot: InventoryMaterial) => (viewLocation ? stockAt(lot, viewLocation) : totalStock(lot));
  const hasUncategorized = catalogs.some((catalog) => !catalog.category_id);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    const order = new Map(categories.map((item, index) => [item.id, index]));
    return catalogs
      .map((catalog) => ({ catalog, lots: materials.filter((item) => item.catalog_id === catalog.id) }))
      .filter(({ catalog, lots }) => {
        if (category === "none" && catalog.category_id) return false;
        if (category !== "all" && category !== "none" && catalog.category_id !== category) return false;
        if (viewLocation && !lots.some((lot) => stockAt(lot, viewLocation) > 0)) return false;
        return !query || [catalog.material_name, catalog.material_type ?? "", catalog.size ?? "", ...lots.map((item) => item.material_code ?? "")]
          .some((value) => value.toLocaleLowerCase("tr-TR").includes(query));
      })
      .sort((a, b) => {
        const categoryOrder = (order.get(a.catalog.category_id ?? "") ?? 999) - (order.get(b.catalog.category_id ?? "") ?? 999);
        return categoryOrder || a.catalog.material_name.localeCompare(b.catalog.material_name, "tr");
      });
  }, [materials, catalogs, categories, category, viewLocation, search]);

  async function reload(repository: InventoryRepository) {
    const [nextMaterials, nextCatalogs, nextCategories, nextLocations, nextShipments, nextReceipts] = await Promise.all([
      repository.listMaterials("stock"), repository.listCatalogs(), repository.listCategories(), repository.listLocations(),
      repository.listShipments(), repository.listReceipts(),
    ]);
    setMaterials(nextMaterials); setCatalogs(nextCatalogs); setCategories(nextCategories); setLocations(nextLocations);
    setShipments(nextShipments); setReceipts(nextReceipts);
    if (stockView !== "all" && !nextLocations.some((item) => item.id === stockView)) setStockView("all");
    if (category !== "all" && category !== "none" && !nextCategories.some((item) => item.id === category)) setCategory("all");
  }
  async function run(action: (repository: InventoryRepository) => Promise<unknown>, success: string) {
    setLoading(true);
    try { const repository = new InventoryRepository(createClient()); await action(repository); await reload(repository); toast.success(success); return true; }
    catch (error) { toast.error("İşlem tamamlanamadı", { description: (error as Error)?.message }); return false; }
    finally { setLoading(false); }
  }

  function openMovement(lot: InventoryMaterial) {
    const location = viewLocation ?? locations.find((item) => stockAt(lot, item) > 0) ?? locations[0];
    if (location) setMovement({ material: lot, locationId: location.id });
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><h1 className="text-3xl font-semibold">Malzeme Stok</h1><p className="mt-1 text-sm text-muted-foreground">Malzeme kataloğu, irsaliye girişleri ve depo stokları</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setExportOpen(true)}><FileSpreadsheet />Excel / PDF Çıktı</Button>
        {!readOnly && <>
          <Button variant="outline" onClick={() => setLocationsOpen(true)}><Warehouse />Depolar</Button>
          <Button variant="outline" onClick={() => setCategoriesOpen(true)}><Tags />Kategoriler</Button>
          {locations.length > 1 && <Button variant="outline" onClick={() => setTransferOpen(true)}><Send />Depolar Arası Sevkiyat</Button>}
          <Button variant="outline" onClick={() => setReceiptOpen(true)}><ArrowDownToLine />İrsaliye ile Stok Girişi</Button>
          <Button onClick={() => setCatalogOpen(true)}><Plus />Yeni Malzeme</Button>
        </>}
      </div>
    </div>

    <MaterialRequestsManager initialRequests={initialRequests} catalogs={catalogs} categories={categories} readOnly={readOnly} onChanged={async () => { const repository = new InventoryRepository(createClient()); await reload(repository); }} />

    <section className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label="Depo">
        <ChipButton active={stockView === "all"} color="bg-zinc-700" onClick={() => setStockView("all")}>Tüm Depolar</ChipButton>
        {locations.map((location, index) => <ChipButton key={location.id} active={stockView === location.id} color={LOCATION_COLORS[index % LOCATION_COLORS.length]} onClick={() => setStockView(location.id)}>{location.name}</ChipButton>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-[240px_1fr]">
        <Select value={category} onValueChange={(value) => setCategory(value)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Kategoriler</SelectItem>
            {categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
            {hasUncategorized && <SelectItem value="none">{UNCATEGORIZED_LABEL}</SelectItem>}
          </SelectContent>
        </Select>
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Malzeme adı, türü, ebatı veya ID ara..." />
      </div>

      <div className="overflow-x-auto border-y"><table className="w-full min-w-[950px] text-left text-sm">
        <thead><tr className="border-b bg-muted/50 text-muted-foreground"><th className="px-3 py-3">Kategori</th><th className="px-3 py-3">Malzeme Adı</th><th className="px-3 py-3">Tür</th><th className="px-3 py-3">Ebat</th><th className="px-3 py-3">{viewLocation ? `${viewLocation.name} Toplamı` : "Toplam Stok"}</th><th className="px-3 py-3">{viewLocation ? "ID Bazlı Stok" : "ID ve Depo Dağılımı"}</th>{!readOnly && <th className="px-3 py-3">İşlemler</th>}</tr></thead>
        <tbody>{filtered.map(({ catalog, lots }) => {
          const visibleLots = viewLocation ? lots.filter((lot) => stockAt(lot, viewLocation) > 0) : lots;
          return <tr key={catalog.id} className="border-b align-top last:border-0">
            <td className="px-3 py-3"><Badge className="bg-secondary text-secondary-foreground">{getCategoryName(categories, catalog.category_id)}</Badge></td>
            <td className="px-3 py-3 font-semibold">{catalog.material_name}</td>
            <td className="px-3 py-3">{catalog.material_type || "—"}</td>
            <td className="px-3 py-3">{catalog.size || "—"}</td>
            <td className="px-3 py-3 font-semibold">{formatTotals(visibleLots, quantityOf)}</td>
            <td className="px-3 py-3"><div className="space-y-2">
              {visibleLots.map((lot) => <div key={lot.id} className="flex items-start gap-2">
                <div>
                  <span>{catalog.has_id && <strong>ID: {lot.material_code}</strong>}{catalog.has_id && " · "}{formatInventoryQuantity(quantityOf(lot), lot.unit)}</span>
                  {!viewLocation && locations.length > 1 && <p className="text-xs text-muted-foreground">{locations.filter((location) => stockAt(lot, location) > 0).map((location) => `${location.name}: ${formatInventoryQuantity(stockAt(lot, location), lot.unit)}`).join(" · ") || "Stok yok"}</p>}
                </div>
                {!readOnly && totalStock(lot) > 0 && <Button title="Stoktan düş" variant="ghost" size="icon" onClick={() => openMovement(lot)}><ArrowUpFromLine /></Button>}
                {!readOnly && catalog.has_id && <Button title={`${lot.material_code || "Bu ID"} kaydını sil`} variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteMaterialTarget(lot)}><Trash2 /></Button>}
              </div>)}
              {!visibleLots.length && <span className="text-muted-foreground">{viewLocation ? "Bu depoda stok yok" : "Henüz irsaliye girişi yok"}</span>}
            </div></td>
            {!readOnly && <td className="px-3 py-3"><Button title="Malzemeyi tamamen sil" variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteCatalogTarget(catalog)}><Trash2 /></Button></td>}
          </tr>;
        })}</tbody>
      </table></div>
      {!filtered.length && <p className="py-10 text-center text-sm text-muted-foreground">{catalogs.length ? "Bu filtrede malzeme bulunamadı." : "Henüz malzeme yok. Önce kategorilerinizi ve depolarınızı tanımlayıp \"Yeni Malzeme\" ile kataloğa ekleyin."}</p>}
    </section>

    <ReceiptHistory receipts={receipts} />
    <ShipmentHistory shipments={shipments} locations={locations} readOnly={readOnly} onUndo={setUndoShipmentTarget} />

    <ExportDialog key={exportOpen ? "open" : "closed"} open={exportOpen} setOpen={setExportOpen} initialCategory={category} catalogs={catalogs} categories={categories} locations={locations} materials={materials} />
    <CatalogDialog open={catalogOpen} setOpen={setCatalogOpen} categories={categories} loading={loading} onSave={async (payload) => { const ok = await run((repository) => repository.createCatalogMaterial(payload), "Malzeme kataloğa eklendi"); if (ok) setCatalogOpen(false); }} />
    <ReceiptDialog open={receiptOpen} setOpen={setReceiptOpen} catalogs={catalogs} categories={categories} locations={locations} loading={loading} onSave={async (payload) => { const ok = await run((repository) => repository.createReceipt(payload), "İrsaliye stoğa işlendi"); if (ok) setReceiptOpen(false); }} />
    <TransferDialog key={transferOpen ? "t-open" : "t-closed"} open={transferOpen} setOpen={setTransferOpen} materials={materials} locations={locations} loading={loading} onSave={async (payload) => { const ok = await run((repository) => repository.createTransfer(payload), "Sevkiyat kaydedildi"); if (ok) setTransferOpen(false); }} />
    <MovementDialog key={movement ? `${movement.material.id}-${movement.locationId}` : "none"} state={movement} setState={setMovement} locations={locations} personnel={personnel} loading={loading} onSave={async (payload) => { const ok = await run((repository) => repository.recordMovement(payload), "Malzeme stoktan düşüldü"); if (ok) setMovement(null); }} />
    <ManageListDialog
      open={locationsOpen} setOpen={setLocationsOpen} loading={loading} title="Depolar" itemLabel="Depo"
      description="Ana depo silinemez ama adı değiştirilebilir. Stoğu veya hareket geçmişi olan depo silinemez."
      items={locations.map((item) => ({ id: item.id, name: item.name, badge: item.is_main ? "Ana depo" : undefined, deletable: !item.is_main }))}
      onSave={(id, name) => run((repository) => repository.saveLocation(id, name), id ? "Depo adı güncellendi" : "Depo eklendi")}
      onDelete={(id) => run((repository) => repository.deleteLocation(id), "Depo silindi")}
    />
    <ManageListDialog
      open={categoriesOpen} setOpen={setCategoriesOpen} loading={loading} title="Malzeme Kategorileri" itemLabel="Kategori"
      description="Kategori silinirse içindeki malzemeler silinmez, Kategorisiz olarak kalır."
      items={categories.map((item) => ({ id: item.id, name: item.name, deletable: true }))}
      onSave={(id, name) => run((repository) => repository.saveCategory(id, name), id ? "Kategori güncellendi" : "Kategori eklendi")}
      onDelete={(id) => run((repository) => repository.deleteCategory(id), "Kategori silindi")}
    />
    <ConfirmDialog open={Boolean(deleteMaterialTarget)} title="Malzeme ID Kaydını Sil" description={`${deleteMaterialTarget?.material_code || "Seçilen ID"} kaydı; bütün depolardaki stoğu ve yalnızca bu ID'ye bağlı hareket geçmişiyle birlikte kalıcı olarak silinecek. Aynı malzemenin diğer ID kayıtları korunacak.`} setOpen={(open) => !open && setDeleteMaterialTarget(null)} loading={loading} onConfirm={async () => { if (!deleteMaterialTarget) return; const ok = await run((repository) => repository.deleteMaterial(deleteMaterialTarget.id), `${deleteMaterialTarget.material_code || "Malzeme ID"} kaydı silindi`); if (ok) setDeleteMaterialTarget(null); }} />
    <ConfirmDialog open={Boolean(deleteCatalogTarget)} title="Malzemeyi Tamamen Sil" description="Bu katalog malzemesinin tüm ID'leri, bütün depolardaki stoğu ve bütün hareket geçmişi kalıcı olarak silinecek." setOpen={(open) => !open && setDeleteCatalogTarget(null)} loading={loading} onConfirm={async () => { if (!deleteCatalogTarget) return; const ok = await run((repository) => repository.deleteCatalog(deleteCatalogTarget.id), "Malzeme ve tüm ID geçmişi silindi"); if (ok) setDeleteCatalogTarget(null); }} />
    <ConfirmDialog open={Boolean(undoShipmentTarget)} title="Sevkiyatı Geri Al" confirmLabel="Geri Al" description="Sevk edilen miktarlar çıkış deposuna geri döner. Varış deposunda bu malzemeler kullanılmışsa geri alınamaz." setOpen={(open) => !open && setUndoShipmentTarget(null)} loading={loading} onConfirm={async () => { if (!undoShipmentTarget) return; const ok = await run((repository) => repository.deleteTransfer(undoShipmentTarget.id), "Sevkiyat geri alındı"); if (ok) setUndoShipmentTarget(null); }} />
  </div>;
}

function ChipButton({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-full px-4 py-2 text-xs font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 ${color} ${active ? "ring-2 ring-ring ring-offset-2" : "opacity-75"}`}>{children}</button>;
}

function CategorySelect({ categories, value, onChange }: { categories: InventoryCategory[]; value: string | null; onChange: (value: string | null) => void }) {
  return <Select value={value ?? "none"} onValueChange={(next) => onChange(next === "none" ? null : next)}>
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent><SelectItem value="none">{UNCATEGORIZED_LABEL}</SelectItem>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
  </Select>;
}

function LocationSelect({ locations, value, onChange, exclude, describe }: { locations: InventoryLocation[]; value: string; onChange: (value: string) => void; exclude?: string; describe?: (location: InventoryLocation) => string }) {
  return <Select value={value} onValueChange={onChange}>
    <SelectTrigger><SelectValue placeholder="Depo seçin" /></SelectTrigger>
    <SelectContent>{locations.filter((item) => item.id !== exclude).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}{describe ? ` — ${describe(item)}` : ""}</SelectItem>)}</SelectContent>
  </Select>;
}

function CatalogDialog({ open, setOpen, categories, loading, onSave }: { open: boolean; setOpen: (open: boolean) => void; categories: InventoryCategory[]; loading: boolean; onSave: (payload: { material_name: string; category_id: string | null; material_type?: string; size?: string; unit: InventoryUnit; has_id: boolean; notes?: string }) => Promise<void> }) {
  const [data, setData] = useState({ material_name: "", category_id: null as string | null, material_type: "", size: "", unit: "piece" as InventoryUnit, has_id: false, notes: "" });
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Yeni Malzeme Kaydı</DialogTitle></DialogHeader>
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (data.material_name.trim().length < 2) return toast.error("Malzeme adı zorunlu"); void onSave(data); }}>
      <Field label="Kategori"><CategorySelect categories={categories} value={data.category_id} onChange={(value) => setData({ ...data, category_id: value })} /></Field>
      <Field label="Malzeme Adı"><Input value={data.material_name} onChange={(e) => setData({ ...data, material_name: e.target.value })} /></Field>
      <Field label="Tür"><Input value={data.material_type} onChange={(e) => setData({ ...data, material_type: e.target.value })} /></Field>
      <Field label="Ebat"><Input value={data.size} onChange={(e) => setData({ ...data, size: e.target.value })} /></Field>
      <Field label="Birim Cinsi"><Select value={data.unit} onValueChange={(value: InventoryUnit) => setData({ ...data, unit: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{INVENTORY_UNITS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></Field>
      <Field label="ID / Seri No Takibi"><Select value={data.has_id ? "yes" : "no"} onValueChange={(value) => setData({ ...data, has_id: value === "yes" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="no">ID Yok</SelectItem><SelectItem value="yes">Her girişte ID / seri no</SelectItem></SelectContent></Select></Field>
      <div className="sm:col-span-2"><Field label="Not"><Textarea value={data.notes} onChange={(e) => setData({ ...data, notes: e.target.value })} /></Field></div>
      {!categories.length && <p className="text-xs text-muted-foreground sm:col-span-2">İpucu: &quot;Kategoriler&quot; düğmesiyle kendi kategorilerinizi (ör. Elektrik, Sıhhi Tesisat, Yedek Parça) tanımlayabilirsiniz.</p>}
      <Button className="sm:col-span-2" disabled={loading}>{loading && <Loader2 className="animate-spin" />}Malzemeyi Kaydet</Button>
    </form>
  </DialogContent></Dialog>;
}

function ExportDialog({ open, setOpen, initialCategory, catalogs, categories, locations, materials }: { open: boolean; setOpen: (open: boolean) => void; initialCategory: CategoryFilter; catalogs: InventoryCatalog[]; categories: InventoryCategory[]; locations: InventoryLocation[]; materials: InventoryMaterial[] }) {
  const brand = useReportBrand();
  const options = [...categories.map((item) => ({ id: item.id as string | null, name: item.name })), ...(catalogs.some((item) => !item.category_id) ? [{ id: null, name: UNCATEGORIZED_LABEL }] : [])];
  const allIds = options.map((item) => item.id);
  const [selected, setSelected] = useState<(string | null)[]>(() => initialCategory === "all" ? allIds : [initialCategory === "none" ? null : initialCategory]);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [includeLogo, setIncludeLogo] = useState(Boolean(brand.logoUrl));
  const allSelected = selected.length === allIds.length;
  const toggle = (id: string | null, checked: boolean) => setSelected((current) => checked ? allIds.filter((item) => item === id || current.includes(item)) : current.filter((item) => item !== id));
  const selectedNames = options.filter((item) => selected.includes(item.id)).map((item) => item.name);
  // Kullanıcı başlığa dokunmadıysa seçime göre otomatik başlık önerilir.
  const autoTitle = getInventoryExportTitle(brand.name, allSelected ? [] : selectedNames);
  const title = customTitle ?? autoTitle;
  async function exportFile(format: "excel" | "pdf") {
    if (!selected.length) return toast.error("En az bir kategori seçin");
    setExporting(format);
    try {
      const exportOptions = { brand, catalogs, materials, categories, locations, selectedCategoryIds: selected, title, includeLogo, fileName: `malzeme-stok-${today()}.${format === "excel" ? "xlsx" : "pdf"}` };
      await (format === "excel" ? downloadInventoryStockExcel(exportOptions) : downloadInventoryStockPdf(exportOptions));
      setOpen(false);
    }
    catch (error) { toast.error(`${format === "excel" ? "Excel" : "PDF"} dosyası oluşturulamadı`, { description: (error as Error)?.message }); }
    finally { setExporting(null); }
  }
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Malzeme Stok Çıktısı</DialogTitle></DialogHeader>
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Çıktıya eklenecek kategorileri seçin. Her depo ayrı sütunda listelenir.</p>
      <label className="flex items-center gap-2 border-b pb-3 font-semibold"><input type="checkbox" checked={allSelected} onChange={(event) => setSelected(event.target.checked ? allIds : [])} className="h-4 w-4 accent-primary" />Tümünü Seç</label>
      {options.map((item) => <label key={item.id ?? "none"} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => toggle(item.id, event.target.checked)} className="h-4 w-4 accent-primary" />{item.name}<span className="text-muted-foreground">({catalogs.filter((catalog) => (catalog.category_id ?? null) === item.id).length} malzeme)</span></label>)}
      {!options.length && <p className="text-sm text-muted-foreground">Henüz malzeme yok.</p>}
    </div>
    <div className="space-y-3 border-t pt-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="inventory-export-title">Üst başlık</Label>
          {customTitle !== null && <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setCustomTitle(null)}>Otomatik başlığa dön</button>}
        </div>
        <Input id="inventory-export-title" value={title} onChange={(event) => setCustomTitle(event.target.value)} maxLength={200} placeholder="Çıktının üstünde yazacak başlık" />
      </div>
      {brand.logoUrl ? (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeLogo} onChange={(event) => setIncludeLogo(event.target.checked)} className="h-4 w-4 accent-primary" />Firma logosunu ekle</label>
      ) : (
        <p className="text-xs text-muted-foreground">Logo eklemek için Ayarlar → Firma Logosu&apos;ndan logo yükleyin.</p>
      )}
    </div>
    <div className="grid gap-2 sm:grid-cols-2"><Button disabled={Boolean(exporting) || !selected.length || !title.trim()} onClick={() => exportFile("excel")}>{exporting === "excel" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}Excel İndir</Button><Button variant="outline" disabled={Boolean(exporting) || !selected.length || !title.trim()} onClick={() => exportFile("pdf")}>{exporting === "pdf" ? <Loader2 className="animate-spin" /> : <FileText />}PDF İndir</Button></div>
  </DialogContent></Dialog>;
}

function ReceiptDialog({ open, setOpen, catalogs, categories, locations, loading, onSave }: { open: boolean; setOpen: (open: boolean) => void; catalogs: InventoryCatalog[]; categories: InventoryCategory[]; locations: InventoryLocation[]; loading: boolean; onSave: (payload: { receipt_date: string; received_by: string; dispatch_number: string; notes?: string; location_id: string | null; items: { catalog_id: string; material_code?: string; quantity: number }[] }) => Promise<void> }) {
  const [data, setData] = useState({ receipt_date: today(), received_by: "", dispatch_number: "", notes: "" });
  const [locationId, setLocationId] = useState("");
  const [lines, setLines] = useState<ReceiptLine[]>([{ catalog_id: "", material_code: "", unit: "piece", quantity: "1" }]);
  const targetId = locationId || locations.find((item) => item.is_main)?.id || "";
  const items = lines.filter((line) => line.catalog_id && Number(line.quantity) > 0).map((line) => ({ catalog_id: line.catalog_id, material_code: line.material_code.trim() || undefined, quantity: Number(line.quantity) }));
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>İrsaliye ile Stok Girişi</DialogTitle></DialogHeader>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!data.receipt_date || data.received_by.trim().length < 2 || !data.dispatch_number.trim() || !items.length) return toast.error("Tarih, teslim alan, irsaliye ve malzeme zorunlu"); void onSave({ ...data, location_id: targetId || null, items }); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Teslim Tarihi"><Input type="date" value={data.receipt_date} onChange={(e) => setData({ ...data, receipt_date: e.target.value })} /></Field>
        <Field label="İrsaliye No"><Input value={data.dispatch_number} onChange={(e) => setData({ ...data, dispatch_number: e.target.value })} /></Field>
        <Field label="Teslim Alan"><Input value={data.received_by} onChange={(e) => setData({ ...data, received_by: e.target.value })} /></Field>
        <Field label="Giriş Yapılacak Depo"><LocationSelect locations={locations} value={targetId} onChange={setLocationId} /></Field>
        <div className="sm:col-span-2"><Field label="Not"><Input value={data.notes} onChange={(e) => setData({ ...data, notes: e.target.value })} /></Field></div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between"><Label>Malzeme Listesi</Label><Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, { catalog_id: "", material_code: "", unit: "piece", quantity: "1" }])}><Plus />Satır Ekle</Button></div>
        {lines.map((line, index) => { const selected = catalogs.find((item) => item.id === line.catalog_id); return <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_100px_120px_40px]">
          <Select value={line.catalog_id} onValueChange={(value) => { const catalog = catalogs.find((item) => item.id === value); setLines((current) => current.map((item, i) => i === index ? { ...item, catalog_id: value, unit: catalog?.unit ?? "piece" } : item)); }}><SelectTrigger><SelectValue placeholder="Katalog malzemesi" /></SelectTrigger><SelectContent>{catalogs.map((item) => <SelectItem key={item.id} value={item.id}>{getCategoryName(categories, item.category_id)} · {item.material_name}{item.size ? ` · ${item.size}` : ""}</SelectItem>)}</SelectContent></Select>
          <Input placeholder={selected?.has_id ? "ID / seri no" : "ID (yok)"} disabled={Boolean(selected && !selected.has_id)} value={line.material_code} onChange={(e) => setLines((current) => current.map((item, i) => i === index ? { ...item, material_code: e.target.value } : item))} />
          <Input readOnly aria-label="Birim" value={selected ? INVENTORY_UNITS.find((unit) => unit.value === selected.unit)?.label ?? selected.unit : "Birim"} />
          <Input aria-label="Miktar" type="number" min="0" step={selected?.unit === "piece" ? "1" : "0.001"} value={line.quantity} onChange={(e) => setLines((current) => current.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} />
          <Button type="button" title="Satırı sil" variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}><Trash2 /></Button>
        </div>; })}
        {!catalogs.length && <p className="text-sm text-muted-foreground">Önce &quot;Yeni Malzeme&quot; ile kataloğa malzeme ekleyin.</p>}
      </div>
      <Button className="w-full" disabled={loading}>{loading && <Loader2 className="animate-spin" />}Stoğa Al</Button>
    </form>
  </DialogContent></Dialog>;
}

function TransferDialog({ open, setOpen, materials, locations, loading, onSave }: { open: boolean; setOpen: (open: boolean) => void; materials: InventoryMaterial[]; locations: InventoryLocation[]; loading: boolean; onSave: (payload: { shipment_date: string; from_location_id: string; to_location_id: string; delivered_by: string; received_by: string; vehicle_plate?: string; notes?: string; items: { material_id: string; quantity: number }[] }) => Promise<void> }) {
  const [data, setData] = useState({ shipment_date: today(), delivered_by: "", received_by: "", vehicle_plate: "", notes: "" });
  const [fromId, setFromId] = useState(locations.find((item) => item.is_main)?.id ?? locations[0]?.id ?? "");
  const [toId, setToId] = useState(locations.find((item) => item.id !== fromId)?.id ?? "");
  const [lines, setLines] = useState<Line[]>([{ material_id: "", quantity: "1" }]);
  const from = locations.find((item) => item.id === fromId);
  const available = from ? materials.filter((item) => stockAt(item, from) > 0) : [];
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Depolar Arası Sevkiyat</DialogTitle></DialogHeader>
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const items = normalizeLines(lines); if (!fromId || !toId || fromId === toId) return toast.error("Farklı iki depo seçin"); if (data.delivered_by.trim().length < 2 || data.received_by.trim().length < 2) return toast.error("Teslim eden ve teslim alan zorunlu"); if (!items.length) return toast.error("En az bir malzeme ekleyin"); void onSave({ ...data, from_location_id: fromId, to_location_id: toId, items }); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Çıkış Deposu"><LocationSelect locations={locations} value={fromId} onChange={(value) => { setFromId(value); setLines([{ material_id: "", quantity: "1" }]); if (value === toId) setToId(locations.find((item) => item.id !== value)?.id ?? ""); }} /></Field>
        <Field label="Varış Deposu"><LocationSelect locations={locations} value={toId} onChange={setToId} exclude={fromId} /></Field>
        <Field label="Tarih"><Input type="date" value={data.shipment_date} onChange={(e) => setData({ ...data, shipment_date: e.target.value })} /></Field>
        <Field label="Araç / Plaka (opsiyonel)"><Input value={data.vehicle_plate} onChange={(e) => setData({ ...data, vehicle_plate: e.target.value })} /></Field>
        <Field label="Teslim Eden"><Input value={data.delivered_by} onChange={(e) => setData({ ...data, delivered_by: e.target.value })} /></Field>
        <Field label="Teslim Alan"><Input value={data.received_by} onChange={(e) => setData({ ...data, received_by: e.target.value })} /></Field>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between"><Label>Malzeme Listesi</Label><Button type="button" size="sm" variant="outline" onClick={() => setLines((value) => [...value, { material_id: "", quantity: "1" }])}><Plus />Satır Ekle</Button></div>
        {lines.map((line, index) => <div key={index} className="grid grid-cols-[1fr_120px_40px] gap-2">
          <Select value={line.material_id} onValueChange={(value) => setLines((current) => current.map((item, i) => i === index ? { ...item, material_id: value } : item))}><SelectTrigger><SelectValue placeholder="Malzeme seçin" /></SelectTrigger><SelectContent>{available.map((item) => <SelectItem key={item.id} value={item.id}>{item.material_name}{item.size ? ` · ${item.size}` : ""}{item.material_code ? ` (${item.material_code})` : ""} — {formatInventoryQuantity(from ? stockAt(item, from) : 0, item.unit)}</SelectItem>)}</SelectContent></Select>
          <Input aria-label="Sevk miktarı" type="number" min="0" step="0.001" value={line.quantity} onChange={(e) => setLines((current) => current.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} />
          <Button type="button" title="Satırı sil" variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}><Trash2 /></Button>
        </div>)}
        {from && !available.length && <p className="text-sm text-muted-foreground">{from.name} deposunda stok yok.</p>}
      </div>
      <Field label="Not"><Input value={data.notes} onChange={(e) => setData({ ...data, notes: e.target.value })} /></Field>
      <Button className="w-full" disabled={loading}>{loading && <Loader2 className="animate-spin" />}Sevkiyatı Kaydet</Button>
    </form>
  </DialogContent></Dialog>;
}

function MovementDialog({ state, setState, locations, personnel, loading, onSave }: { state: { material: InventoryMaterial; locationId: string } | null; setState: (value: null) => void; locations: InventoryLocation[]; personnel: Personnel[]; loading: boolean; onSave: (payload: { material_id: string; movement_type: "out"; quantity: number; location_id: string; project_name?: string; project_code?: string; team_personnel_ids?: string[] }) => Promise<void> }) {
  const [quantity, setQuantity] = useState("1");
  const [locationId, setLocationId] = useState(state?.locationId ?? "");
  const [project, setProject] = useState(""); const [projectCode, setProjectCode] = useState(""); const [personId, setPersonId] = useState("");
  const material = state?.material;
  const withStock = material ? locations.filter((item) => stockAt(material, item) > 0 || item.id === state?.locationId) : [];
  return <Dialog open={Boolean(state)} onOpenChange={(open) => !open && setState(null)}><DialogContent><DialogHeader><DialogTitle>Stoktan Düş</DialogTitle></DialogHeader>
    {material && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (project.trim().length < 2) return toast.error("Proje / kullanım yeri zorunlu"); void onSave({ material_id: material.id, movement_type: "out", quantity: Number(quantity), location_id: locationId, project_name: project, project_code: projectCode, team_personnel_ids: personId ? [personId] : [] }); }}>
      <p className="font-semibold">{material.material_name}{material.material_code ? ` · ${material.material_code}` : ""}</p>
      <Field label="Depo"><LocationSelect locations={withStock} value={locationId} onChange={setLocationId} describe={(location) => formatInventoryQuantity(stockAt(material, location), material.unit)} /></Field>
      <Field label="Miktar"><Input type="number" min="0" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
      <Field label="Proje / Kullanım Yeri"><Input value={project} onChange={(e) => setProject(e.target.value)} /></Field>
      <Field label="Proje Kodu (opsiyonel)"><Input value={projectCode} onChange={(e) => setProjectCode(e.target.value)} /></Field>
      <Field label="Teslim Alan Personel (opsiyonel)"><Select value={personId || "none"} onValueChange={(value) => setPersonId(value === "none" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Seçilmedi</SelectItem>{personnel.map((person) => <SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>)}</SelectContent></Select></Field>
      <Button className="w-full" disabled={loading}>Kaydet</Button>
    </form>}
  </DialogContent></Dialog>;
}

function ManageListDialog({ open, setOpen, loading, title, itemLabel, description, items, onSave, onDelete }: {
  open: boolean; setOpen: (open: boolean) => void; loading: boolean; title: string; itemLabel: string; description: string;
  items: { id: string; name: string; badge?: string; deletable: boolean }[];
  onSave: (id: string | null, name: string) => Promise<boolean>; onDelete: (id: string) => Promise<boolean>;
}) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) { setEditing(null); setNewName(""); } }}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
    <p className="text-sm text-muted-foreground">{description}</p>
    <div className="divide-y rounded-md border">
      {items.map((item) => <div key={item.id} className="flex items-center gap-2 p-2">
        {editing?.id === item.id ? <>
          <Input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onSave(item.id, editing.name).then((ok) => ok && setEditing(null)); } }} />
          <Button size="sm" disabled={loading} onClick={() => void onSave(item.id, editing.name).then((ok) => ok && setEditing(null))}>Kaydet</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Vazgeç</Button>
        </> : <>
          <span className="flex-1 font-medium">{item.name}</span>
          {item.badge && <Badge className="bg-secondary text-secondary-foreground">{item.badge}</Badge>}
          <Button title="Adını değiştir" variant="ghost" size="icon" onClick={() => setEditing({ id: item.id, name: item.name })}><Pencil /></Button>
          {item.deletable && <Button title="Sil" variant="ghost" size="icon" className="text-destructive" disabled={loading} onClick={() => { if (window.confirm(`"${item.name}" silinsin mi?`)) void onDelete(item.id); }}><Trash2 /></Button>}
        </>}
      </div>)}
      {!items.length && <p className="p-4 text-center text-sm text-muted-foreground">Henüz kayıt yok.</p>}
    </div>
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!newName.trim()) return; void onSave(null, newName).then((ok) => ok && setNewName("")); }}>
      <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`Yeni ${itemLabel.toLocaleLowerCase("tr-TR")} adı`} />
      <Button disabled={loading || !newName.trim()}>{loading ? <Loader2 className="animate-spin" /> : <Plus />}Ekle</Button>
    </form>
  </DialogContent></Dialog>;
}

function ReceiptHistory({ receipts }: { receipts: InventoryReceipt[] }) {
  const [selectedReceipt, setSelectedReceipt] = useState<InventoryReceipt | null>(null);
  const formatDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("tr-TR");

  return <>
    <Card><CardHeader><CardTitle className="text-base">Geçmiş İrsaliyeler</CardTitle></CardHeader><CardContent><div className="grid grid-cols-[110px_minmax(120px,1fr)_minmax(130px,1fr)] gap-3 border-b pb-2 text-xs font-medium text-muted-foreground"><span>İrsaliye Tarihi</span><span>İrsaliye No</span><span>Teslim Alan</span></div>{receipts.map((receipt) => <div key={receipt.id} className="grid grid-cols-[110px_minmax(120px,1fr)_minmax(130px,1fr)] items-center gap-3 border-b py-3 text-sm"><button type="button" className="w-fit font-medium text-primary underline-offset-4 hover:underline" onClick={() => setSelectedReceipt(receipt)}>{formatDate(receipt.receipt_date)}</button><button type="button" className="w-fit text-left font-semibold text-primary underline-offset-4 hover:underline" onClick={() => setSelectedReceipt(receipt)}>{receipt.dispatch_number}</button><span>{receipt.received_by}</span></div>)}{!receipts.length && <p className="py-6 text-center text-sm text-muted-foreground">Henüz irsaliye girişi yok.</p>}</CardContent></Card>

    <Dialog open={Boolean(selectedReceipt)} onOpenChange={(open) => !open && setSelectedReceipt(null)}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>İrsaliye Detayı</DialogTitle></DialogHeader>{selectedReceipt && <div className="space-y-5"><div className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-3"><div><span className="block text-xs text-muted-foreground">İrsaliye Tarihi</span><strong>{formatDate(selectedReceipt.receipt_date)}</strong></div><div><span className="block text-xs text-muted-foreground">İrsaliye No</span><strong>{selectedReceipt.dispatch_number}</strong></div><div><span className="block text-xs text-muted-foreground">Teslim Alan</span><strong>{selectedReceipt.received_by}</strong></div>{selectedReceipt.notes && <div className="sm:col-span-3"><span className="block text-xs text-muted-foreground">Not</span><span>{selectedReceipt.notes}</span></div>}</div><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="px-2 py-2">Malzeme</th><th className="px-2 py-2">Tür / Ebat</th><th className="px-2 py-2">Malzeme ID</th><th className="px-2 py-2 text-right">Miktar</th></tr></thead><tbody>{selectedReceipt.items.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="px-2 py-3 font-medium">{item.material?.material_name ?? "—"}</td><td className="px-2 py-3">{[item.material?.material_type, item.material?.size].filter(Boolean).join(" · ") || "—"}</td><td className="px-2 py-3">{item.material?.material_code || "—"}</td><td className="px-2 py-3 text-right font-medium">{item.material ? formatInventoryQuantity(item.quantity, item.material.unit) : item.quantity}</td></tr>)}</tbody></table></div></div>}</DialogContent></Dialog>
  </>;
}

function ShipmentHistory({ shipments, locations, readOnly, onUndo }: { shipments: InventoryShipment[]; locations: InventoryLocation[]; readOnly: boolean; onUndo: (shipment: InventoryShipment) => void }) {
  if (!shipments.length && locations.length < 2) return null;
  const name = (id: string) => locations.find((item) => item.id === id)?.name ?? "—";
  return <Card><CardHeader><CardTitle className="text-base">Depolar Arası Sevkiyatlar</CardTitle></CardHeader><CardContent>
    {shipments.map((shipment) => <div key={shipment.id} className="grid gap-2 border-b py-3 text-sm md:grid-cols-[100px_minmax(180px,auto)_minmax(160px,1fr)_minmax(0,2fr)_auto] md:items-center">
      <span>{new Date(`${shipment.shipment_date}T00:00:00`).toLocaleDateString("tr-TR")}</span>
      <strong className="flex items-center gap-1">{name(shipment.from_location_id)}<ArrowRight className="h-3.5 w-3.5" />{name(shipment.to_location_id)}</strong>
      <span className="text-muted-foreground">{[shipment.delivered_by, shipment.received_by].join(" → ")}{shipment.vehicle_plate ? ` · ${shipment.vehicle_plate}` : ""}</span>
      <span>{shipment.items.map((item) => `${item.material?.material_name ?? "—"}${item.material?.material_code ? ` (${item.material.material_code})` : ""} — ${item.material ? formatInventoryQuantity(item.quantity, item.material.unit) : item.quantity}`).join(", ")}</span>
      {!readOnly && <Button title="Sevkiyatı geri al" variant="ghost" size="icon" onClick={() => onUndo(shipment)}><Undo2 /></Button>}
    </div>)}
    {!shipments.length && <p className="py-6 text-center text-sm text-muted-foreground">Henüz sevkiyat yok.</p>}
  </CardContent></Card>;
}

function ConfirmDialog({ open, setOpen, title, description, loading, onConfirm, confirmLabel = "Sil" }: { open: boolean; setOpen: (open: boolean) => void; title: string; description: string; loading: boolean; onConfirm: () => Promise<void>; confirmLabel?: string }) { return <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">{description}</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button><Button variant="destructive" disabled={loading} onClick={onConfirm}>{loading && <Loader2 className="animate-spin" />}{confirmLabel}</Button></div></DialogContent></Dialog>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function normalizeLines(lines: Line[]) { return lines.filter((line) => line.material_id && Number(line.quantity) > 0).map((line) => ({ material_id: line.material_id, quantity: Number(line.quantity) })); }
function formatTotals(lots: InventoryMaterial[], quantityOf: (lot: InventoryMaterial) => number) {
  if (!lots.length) return "0";
  const totals = new Map<InventoryUnit, number>();
  for (const lot of lots) totals.set(lot.unit, (totals.get(lot.unit) ?? 0) + quantityOf(lot));
  return [...totals.entries()].map(([unit, quantity]) => formatInventoryQuantity(quantity, unit)).join(" + ");
}
