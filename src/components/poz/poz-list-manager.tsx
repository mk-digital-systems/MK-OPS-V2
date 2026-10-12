"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, History, LibraryBig, Loader2, Pencil, Percent, Plus, Power, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CurrencyCode } from "@/types/auth";
import type { PozImportRow, PozItem, PozList, PozPrice } from "@/types/poz";
import { UNIT_SUGGESTIONS, isValidPoz, todayISODate } from "@/lib/constants/project";
import { formatMoney } from "@/lib/hakedis";
import { cn, formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { PozRepository, priceAt } from "@/modules/poz/poz-repository";
import { normalizeNumberText } from "@/lib/bulk-import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  data: PozList;
  currency: CurrencyCode;
  /** Süper admin: seçilen firma; firma kullanıcısı: null */
  companyId: string | null;
};

/** "1.250,50", "1.250", "12,5" ve "12.50" kabul edilir (bkz. normalizeNumberText). */
const normalizeAmount = normalizeNumberText;
/** "Başlangıçtan itibaren" fiyatın tarihi: önceki bütün işler bu fiyattan hesaplanır. */
const FROM_START = "2000-01-01";
const sinceLabel = (date: string) => (date <= FROM_START ? "başlangıçtan beri" : `${formatDate(date)}'den`);

const toNumber = (value: string) => (value.trim() ? Number(normalizeAmount(value)) : null);
const lower = (value: string | null | undefined) => (value ?? "").trim().toLocaleLowerCase("tr-TR");

/** Firmanın poz listesi: elle / Excel'den / katalogdan ekleme, yürürlük tarihli fiyat, toplu yüzde. */
export function PozListManager({ data, currency, companyId }: Props) {
  const router = useRouter();
  const repository = () => new PozRepository(createClient(), companyId);
  const [catalogId, setCatalogId] = useState(data.catalogs[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dialog, setDialog] = useState<
    | { kind: "item"; item: PozItem | null }
    | { kind: "price"; item: PozItem }
    | { kind: "import" }
    | { kind: "catalog" }
    | { kind: "bulk" }
    | null
  >(null);
  const today = todayISODate();
  const catalog = data.catalogs.find((item) => item.id === catalogId) ?? null;
  const pricesByStage = useMemo(() => {
    const map = new Map<string, PozPrice[]>();
    for (const price of data.prices) map.set(price.stage_id, [...(map.get(price.stage_id) ?? []), price]);
    return map;
  }, [data.prices]);
  const catalogItems = data.items.filter((item) => item.catalog_id === catalogId);
  const groups = [...new Set(catalogItems.map((item) => item.group_name).filter((group): group is string => !!group))];
  const needle = lower(search);
  const visible = catalogItems.filter(
    (item) =>
      (showInactive || item.is_active) &&
      (!needle || [item.poz_code, item.name, item.group_name].some((value) => lower(value).includes(needle)))
  );
  const grouped = useMemo(() => {
    const map = new Map<string, PozItem[]>();
    for (const item of visible) map.set(item.group_name ?? "", [...(map.get(item.group_name ?? "") ?? []), item]);
    return [...map.entries()];
  }, [visible]);
  const refresh = () => {
    setDialog(null);
    router.refresh();
  };

  async function toggleActive(item: PozItem) {
    try {
      await repository().saveItem({
        id: item.id,
        catalogId: item.catalog_id,
        groupName: item.group_name ?? "",
        pozCode: item.poz_code ?? "",
        name: item.name,
        unit: item.unit ?? "",
        isActive: !item.is_active,
      });
      toast.success(item.is_active ? "Poz pasife alındı; yeni imalatta listelenmez" : "Poz yeniden aktif");
      router.refresh();
    } catch (error) {
      toast.error("İşlem yapılamadı", { description: (error as Error)?.message });
    }
  }

  async function remove(item: PozItem) {
    if (!window.confirm(`${item.poz_code ? `${item.poz_code} · ` : ""}${item.name} silinsin mi?`)) return;
    try {
      await repository().deleteItem(item.id);
      toast.success("Poz silindi");
      router.refresh();
    } catch (error) {
      toast.error("Silinemedi", { description: (error as Error)?.message });
    }
  }

  if (data.catalogs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {companyId ? "Bu firmaya henüz katalog atanmamış. Şirketler → Yönet → Kataloglar'dan atayın." : "Firmanıza henüz sektör kataloğu atanmamış. Destek sayfasından bize yazın."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.catalogs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {data.catalogs.map((item) => (
            <Button key={item.id} variant={item.id === catalogId ? "default" : "outline"} size="sm" onClick={() => setCatalogId(item.id)}>
              {item.name}
            </Button>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Poz no, kalem veya grup" className="pl-9" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
            Pasifleri göster
          </label>
          {data.can_edit && (
            <>
              <Button size="sm" onClick={() => setDialog({ kind: "item", item: null })}>
                <Plus className="h-4 w-4" />
                Poz ekle
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "import" })}>
                <ClipboardPaste className="h-4 w-4" />
                Excel&apos;den yapıştır
              </Button>
              {(catalog?.items.length ?? 0) > 0 && (
                <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "catalog" })}>
                  <LibraryBig className="h-4 w-4" />
                  Katalogdan ekle
                </Button>
              )}
            </>
          )}
          {data.can_price && (
            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "bulk" })}>
              <Percent className="h-4 w-4" />
              Toplu fiyat güncelle
            </Button>
          )}
        </CardContent>
      </Card>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {catalogItems.length === 0 ? "Bu katalogda henüz poz yok. Elle, Excel'den ya da katalogdan ekleyin." : "Aramaya uyan poz yok."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-24 px-4 py-3 font-medium">Poz</th>
                    <th className="px-4 py-3 font-medium">Kalem</th>
                    <th className="w-20 px-4 py-3 font-medium">Birim</th>
                    {data.can_price && <th className="w-44 px-4 py-3 text-right font-medium">Güncel fiyat</th>}
                    <th className="w-40 px-4 py-3" />
                  </tr>
                </thead>
                {grouped.map(([group, rows]) => (
                  <tbody key={group || "-"} className="divide-y border-t">
                    {group && (
                      <tr className="bg-muted/30">
                        <td colSpan={data.can_price ? 5 : 4} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {group}
                        </td>
                      </tr>
                    )}
                    {rows.map((item) => {
                      const current = priceAt(pricesByStage.get(item.id) ?? [], today);
                      const upcoming = (pricesByStage.get(item.id) ?? []).find((price) => price.valid_from > today);
                      return (
                        <tr key={item.id} className={cn("hover:bg-muted/40", !item.is_active && "opacity-50")}>
                          <td className="px-4 py-2.5 font-mono text-xs">{item.poz_code || "—"}</td>
                          <td className="px-4 py-2.5">
                            {item.name}
                            {!item.is_active && <Badge className="ml-2 bg-muted text-muted-foreground">Pasif</Badge>}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{item.unit || "—"}</td>
                          {data.can_price && (
                            <td className="px-4 py-2.5 text-right">
                              {current ? (
                                <>
                                  <span className="font-medium tabular-nums">{formatMoney(current.unit_price, currency)}</span>
                                  <span className="block text-[11px] text-muted-foreground">{sinceLabel(current.valid_from)}</span>
                                </>
                              ) : (
                                <Button size="sm" variant="outline" className="h-7 border-amber-300 text-amber-800 dark:text-amber-300" onClick={() => setDialog({ kind: "price", item })}>
                                  Fiyat gir
                                </Button>
                              )}
                              {upcoming && (
                                <span className="block text-[11px] text-sky-700 dark:text-sky-300">
                                  {formatDate(upcoming.valid_from)}: {formatMoney(upcoming.unit_price, currency)}
                                </span>
                              )}
                            </td>
                          )}
                          <td className="px-2 py-2.5">
                            <div className="flex justify-end">
                              {data.can_price && (
                                <Button size="icon" variant="ghost" aria-label="Fiyat ve geçmişi" title="Fiyat ve geçmişi" onClick={() => setDialog({ kind: "price", item })}>
                                  <History className="h-4 w-4" />
                                </Button>
                              )}
                              {data.can_edit && (
                                <>
                                  <Button size="icon" variant="ghost" aria-label="Düzenle" title="Düzenle" onClick={() => setDialog({ kind: "item", item })}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" aria-label={item.is_active ? "Pasife al" : "Aktif yap"} title={item.is_active ? "Pasife al" : "Aktif yap"} onClick={() => toggleActive(item)}>
                                    <Power className="h-4 w-4" />
                                  </Button>
                                  {!item.used && (
                                    <Button size="icon" variant="ghost" aria-label="Sil" title="Sil" onClick={() => remove(item)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        {catalogItems.filter((item) => item.is_active).length} aktif poz · Kullanılmış poz silinmez, pasife alınır. Fiyat, imalatın iş
        tarihinde geçerli olan fiyattır.
      </p>

      {dialog?.kind === "item" && (
        <ItemDialog item={dialog.item} prices={dialog.item ? pricesByStage.get(dialog.item.id) ?? [] : []} catalogId={catalogId} catalogs={data.catalogs} groups={groups} canPrice={data.can_price} currency={currency} repository={repository} onClose={() => setDialog(null)} onSaved={refresh} />
      )}
      {dialog?.kind === "price" && (
        <PriceDialog item={dialog.item} prices={pricesByStage.get(dialog.item.id) ?? []} currency={currency} repository={repository} onClose={() => setDialog(null)} onSaved={refresh} />
      )}
      {dialog?.kind === "import" && (
        <ImportDialog catalogId={catalogId} catalogs={data.catalogs} canPrice={data.can_price} repository={repository} onClose={() => setDialog(null)} onSaved={refresh} />
      )}
      {dialog?.kind === "catalog" && catalog && (
        <CatalogPickDialog catalog={catalog} existing={catalogItems} repository={repository} onClose={() => setDialog(null)} onSaved={refresh} />
      )}
      {dialog?.kind === "bulk" && (
        <BulkDialog catalogs={data.catalogs} catalogId={catalogId} items={data.items} pricesByStage={pricesByStage} currency={currency} repository={repository} onClose={() => setDialog(null)} onSaved={refresh} />
      )}
    </div>
  );
}

type RepoFactory = () => PozRepository;

function useSave(onSaved: () => void) {
  const [saving, setSaving] = useState(false);
  async function run(action: () => Promise<unknown>, message: string) {
    setSaving(true);
    try {
      await action();
      toast.success(message);
      onSaved();
    } catch (error) {
      toast.error("Kaydedilemedi", { description: (error as Error)?.message });
    } finally {
      setSaving(false);
    }
  }
  return { saving, run };
}

function Footer({ saving, onClose, onSave, label = "Kaydet", disabled = false }: { saving: boolean; onClose: () => void; onSave: () => void; label?: string; disabled?: boolean }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" onClick={onClose}>
        Vazgeç
      </Button>
      <Button onClick={onSave} disabled={saving || disabled}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {label}
      </Button>
    </div>
  );
}

type PriceMode = "start" | "date";

/**
 * Fiyat ve geçerlilik: "Başlangıçtan itibaren" yalnızca pozun ilk fiyatında (ya da başlangıç kaydı düzeltilirken)
 * seçilebilir; sonraki fiyatlar (zam) bir tarihten itibaren geçerlidir.
 */
function PriceFields({
  label,
  price,
  mode,
  date,
  allowStart,
  currency,
  onChange,
  autoFocus,
}: {
  label: string;
  price: string;
  mode: PriceMode;
  date: string;
  allowStart: boolean;
  currency: CurrencyCode;
  onChange: (patch: { price?: string; mode?: PriceMode; date?: string }) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>
          {label} ({currency})
        </Label>
        <Input value={price} onChange={(event) => onChange({ price: event.target.value })} inputMode="decimal" autoFocus={autoFocus} />
      </div>
      <div className="space-y-2">
        <Label>Geçerlilik</Label>
        {allowStart ? (
          <NativeSelect value={mode} onChange={(event) => onChange({ mode: event.target.value as PriceMode })}>
            <option value="start">Başlangıçtan itibaren (önceki işler dahil)</option>
            <option value="date">Şu tarihten itibaren…</option>
          </NativeSelect>
        ) : null}
        {(!allowStart || mode === "date") && (
          <Input type="date" value={date} onChange={(event) => onChange({ date: event.target.value })} />
        )}
      </div>
    </div>
  );
}

function ItemDialog({
  item,
  prices,
  catalogId,
  catalogs,
  groups,
  canPrice,
  currency,
  repository,
  onClose,
  onSaved,
}: {
  item: PozItem | null;
  prices: PozPrice[];
  catalogId: string;
  catalogs: PozList["catalogs"];
  groups: string[];
  canPrice: boolean;
  currency: CurrencyCode;
  repository: RepoFactory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    catalogId: item?.catalog_id ?? catalogId,
    groupName: item?.group_name ?? "",
    pozCode: item?.poz_code ?? "",
    name: item?.name ?? "",
    unit: item?.unit ?? "",
    price: "",
    mode: (prices.length ? "date" : "start") as PriceMode,
    validFrom: todayISODate(),
  });
  const { saving, run } = useSave(onSaved);
  const current = priceAt(prices, todayISODate());

  function save() {
    if (!form.name.trim()) return toast.error("Kalem adı zorunlu");
    if (form.pozCode.trim() && !isValidPoz(form.pozCode)) return toast.error("Poz no 3–5 karakter olmalı");
    const price = toNumber(form.price);
    if (price !== null && (Number.isNaN(price) || price < 0)) return toast.error("Birim fiyat geçersiz");
    if (price !== null && form.mode === "date" && !form.validFrom) return toast.error("Fiyatın geçerlilik tarihini girin");
    void run(async () => {
      const id = await repository().saveItem({ id: item?.id ?? null, catalogId: form.catalogId, groupName: form.groupName, pozCode: form.pozCode, name: form.name, unit: form.unit });
      if (canPrice && price !== null) await repository().setPrice(id, price, form.mode === "start" ? FROM_START : form.validFrom);
    }, item ? "Poz güncellendi" : "Poz eklendi");
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Pozu düzenle" : "Poz ekle"}</DialogTitle>
        </DialogHeader>
        <datalist id="poz-groups">{groups.map((group) => <option key={group} value={group} />)}</datalist>
        <datalist id="poz-units">{UNIT_SUGGESTIONS.map((unit) => <option key={unit} value={unit} />)}</datalist>
        <div className="grid gap-4 sm:grid-cols-2">
          {!item && catalogs.length > 1 && (
            <div className="space-y-2 sm:col-span-2">
              <Label>Katalog (sektör)</Label>
              <NativeSelect value={form.catalogId} onChange={(event) => setForm({ ...form, catalogId: event.target.value })}>
                {catalogs.map((catalog) => <option key={catalog.id} value={catalog.id}>{catalog.name}</option>)}
              </NativeSelect>
            </div>
          )}
          <div className="space-y-2">
            <Label>Grup (isteğe bağlı)</Label>
            <Input value={form.groupName} onChange={(event) => setForm({ ...form, groupName: event.target.value })} list="poz-groups" placeholder="Örn. Kablo" />
          </div>
          <div className="space-y-2">
            <Label>Poz no (isteğe bağlı)</Label>
            <Input value={form.pozCode} onChange={(event) => setForm({ ...form, pozCode: event.target.value })} maxLength={5} placeholder="Örn. 1/2" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Kalem adı</Label>
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Örn. Yeraltı kablo çekimi" autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Birim</Label>
            <Input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} list="poz-units" placeholder="m, adet…" />
          </div>
          {canPrice && (
            <>
              {item && (
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  Güncel fiyat:{" "}
                  {current ? (
                    <strong className="text-foreground">
                      {formatMoney(current.unit_price, currency)} ({sinceLabel(current.valid_from)})
                    </strong>
                  ) : (
                    <strong className="text-amber-700">yok</strong>
                  )}
                  . Eski fiyatı düzeltmek için tablodaki fiyat geçmişini kullanın.
                </p>
              )}
              <PriceFields
                label={item && current ? "Yeni birim fiyat (boşsa değişmez)" : "Birim fiyat (isteğe bağlı)"}
                price={form.price}
                mode={form.mode}
                date={form.validFrom}
                allowStart={prices.length === 0}
                currency={currency}
                onChange={(patch) =>
                  setForm({
                    ...form,
                    ...(patch.price !== undefined ? { price: patch.price } : {}),
                    ...(patch.mode ? { mode: patch.mode } : {}),
                    ...(patch.date !== undefined ? { validFrom: patch.date } : {}),
                  })
                }
              />
            </>
          )}
        </div>
        <Footer saving={saving} onClose={onClose} onSave={save} />
      </DialogContent>
    </Dialog>
  );
}

function PriceDialog({ item, prices, currency, repository, onClose, onSaved }: { item: PozItem; prices: PozPrice[]; currency: CurrencyCode; repository: RepoFactory; onClose: () => void; onSaved: () => void }) {
  const [price, setPrice] = useState("");
  const [mode, setMode] = useState<PriceMode>(prices.length ? "date" : "start");
  const [validFrom, setValidFrom] = useState(todayISODate());
  const [editing, setEditing] = useState<PozPrice | null>(null);
  const { saving, run } = useSave(onSaved);
  const history = [...prices].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  // Başlangıç kaydı yalnızca ilk fiyatta ya da o kayıt düzeltilirken seçilebilir.
  const allowStart = prices.length === 0 || (editing?.valid_from ?? "") <= FROM_START && !!editing;

  function startEdit(entry: PozPrice) {
    setEditing(entry);
    setPrice(String(entry.unit_price).replace(".", ","));
    if (entry.valid_from <= FROM_START) setMode("start");
    else {
      setMode("date");
      setValidFrom(entry.valid_from);
    }
  }

  function save() {
    const value = toNumber(price);
    if (value === null || Number.isNaN(value) || value < 0) return toast.error("Geçerli bir birim fiyat girin");
    const date = allowStart && mode === "start" ? FROM_START : validFrom;
    if (!date) return toast.error("Geçerlilik tarihini girin");
    if (!editing && history.some((entry) => entry.valid_from === date) && !window.confirm(`${sinceLabel(date)} geçerli fiyat zaten var; yenisiyle değiştirilsin mi?`)) return;
    void run(async () => {
      // Tarihi değişen kayıt: eski tarihteki fiyat kaldırılır, yeni tarihe yazılır.
      if (editing && editing.valid_from !== date) await repository().setPrice(item.id, null, editing.valid_from);
      await repository().setPrice(item.id, value, date);
    }, editing ? "Fiyat düzeltildi" : "Fiyat kaydedildi");
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item.poz_code ? `${item.poz_code} · ` : ""}{item.name}</DialogTitle>
        </DialogHeader>
        {editing && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm dark:border-sky-900 dark:bg-sky-950/40">
            <span>
              {sinceLabel(editing.valid_from)} geçerli {formatMoney(editing.unit_price, currency)} düzeltiliyor
            </span>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setPrice(""); setMode(prices.length ? "date" : "start"); setValidFrom(todayISODate()); }}>
              Vazgeç
            </Button>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <PriceFields
            label={editing ? "Doğru birim fiyat" : prices.length ? "Yeni birim fiyat (zam)" : "Birim fiyat"}
            price={price}
            mode={mode}
            date={validFrom}
            allowStart={allowStart}
            currency={currency}
            onChange={(patch) => {
              if (patch.price !== undefined) setPrice(patch.price);
              if (patch.mode) setMode(patch.mode);
              if (patch.date !== undefined) setValidFrom(patch.date);
            }}
            autoFocus
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {prices.length === 0
            ? "İlk fiyat başlangıçtan geçerli olursa, fiyat girilmeden önce yapılmış imalatlar da bu fiyattan hesaplanır."
            : "Zam bir tarihten itibaren geçerli olur; önceki işlerin tutarı değişmez. Yanlış girilmiş bir fiyatı düzeltmek için geçmişteki kaydın kalem simgesini kullanın."}
        </p>
        <div className="space-y-1">
          <Label>Fiyat geçmişi</Label>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz fiyat yok.</p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {history.map((entry) => (
                <li key={entry.valid_from} className={cn("flex items-center justify-between gap-2 px-3 py-2", editing?.valid_from === entry.valid_from && "bg-sky-50 dark:bg-sky-950/40")}>
                  <span>{sinceLabel(entry.valid_from)}</span>
                  <span className="flex items-center gap-1">
                    <span className="font-medium tabular-nums">{formatMoney(entry.unit_price, currency)}</span>
                    <Button size="icon" variant="ghost" aria-label="Bu fiyatı düzelt" title="Düzelt" disabled={saving} onClick={() => startEdit(entry)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Bu fiyat kaydını sil"
                      title="Sil"
                      disabled={saving}
                      onClick={() =>
                        window.confirm(`${sinceLabel(entry.valid_from)} geçerli fiyat silinsin mi?`) &&
                        void run(() => repository().setPrice(item.id, null, entry.valid_from), "Fiyat kaydı silindi")
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Footer saving={saving} onClose={onClose} onSave={save} label={editing ? "Düzeltmeyi kaydet" : "Fiyatı kaydet"} />
      </DialogContent>
    </Dialog>
  );
}

/** Excel'den kopyalanan satırlar: Grup · Poz · Kalem · Birim · (Fiyat) */
function parseRows(text: string, withPrice: boolean): PozImportRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(line.includes("\t") ? "\t" : ";").map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean))
    .filter((cells, index) => !(index === 0 && /kalem/i.test(cells.join(" ")) && /birim/i.test(cells.join(" "))))
    .map((cells) => ({
      group_name: cells[0] ?? "",
      poz_code: cells[1] ?? "",
      name: cells[2] ?? "",
      unit: cells[3] ?? "",
      ...(withPrice && cells[4] ? { unit_price: normalizeAmount(cells[4]) } : {}),
    }))
    .filter((row) => row.name);
}

function ImportDialog({ catalogId, catalogs, canPrice, repository, onClose, onSaved }: { catalogId: string; catalogs: PozList["catalogs"]; canPrice: boolean; repository: RepoFactory; onClose: () => void; onSaved: () => void }) {
  const [target, setTarget] = useState(catalogId);
  const [text, setText] = useState("");
  const [validFrom, setValidFrom] = useState(todayISODate());
  const [dateMode, setDateMode] = useState<"auto" | "date">("auto");
  const { saving, run } = useSave(onSaved);
  const rows = parseRows(text, canPrice);
  const badPoz = rows.find((row) => row.poz_code && !isValidPoz(row.poz_code));
  const badPrice = rows.find((row) => row.unit_price !== undefined && !(Number(row.unit_price) >= 0));

  function save() {
    if (!rows.length) return toast.error("Yapıştırılan satır yok");
    if (badPoz) return toast.error(`Poz no 3–5 karakter olmalı: ${badPoz.poz_code}`);
    if (badPrice) return toast.error(`Fiyat okunamadı: ${badPrice.name} (${badPrice.unit_price})`);
    void run(async () => {
      const result = await repository().importItems(target, rows, dateMode === "auto" ? null : validFrom);
      toast.message(`${result.count} poz işlendi${result.priced ? `, ${result.priced} fiyat yazıldı` : ""}`);
    }, "Poz listesi aktarıldı");
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Excel&apos;den poz yapıştır</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Excel&apos;de sırasıyla <strong>Grup</strong>, <strong>Poz</strong>, <strong>Kalem</strong>, <strong>Birim</strong>
          {canPrice && <>, <strong>Fiyat</strong></>} sütunlarını kopyalayıp yapıştırın. Poz no (yoksa kalem adı) aynı olan poz güncellenir,
          olmayan eklenir.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {catalogs.length > 1 && (
            <div className="space-y-2">
              <Label>Katalog (sektör)</Label>
              <NativeSelect value={target} onChange={(event) => setTarget(event.target.value)}>
                {catalogs.map((catalog) => <option key={catalog.id} value={catalog.id}>{catalog.name}</option>)}
              </NativeSelect>
            </div>
          )}
          {canPrice && (
            <div className="space-y-2">
              <Label>Fiyatların geçerliliği</Label>
              <NativeSelect value={dateMode} onChange={(event) => setDateMode(event.target.value as "auto" | "date")}>
                <option value="auto">Otomatik: yeni pozlarda başlangıçtan, fiyatı olanlarda bugünden</option>
                <option value="date">Hepsi şu tarihten itibaren…</option>
              </NativeSelect>
              {dateMode === "date" && <Input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />}
            </div>
          )}
        </div>
        <Textarea rows={8} value={text} onChange={(event) => setText(event.target.value)} placeholder={"Kablo\t1/1\tBlokta kablo çekimi\tm\t8,50\nEk\t2/1\tFiber ek yapımı\tadet\t150"} autoFocus />
        {rows.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-lg border text-xs">
            <table className="w-full">
              <tbody className="divide-y">
                {rows.slice(0, 50).map((row, index) => (
                  <tr key={index} className={cn(row.poz_code && !isValidPoz(row.poz_code) && "bg-rose-50 dark:bg-rose-950/30")}>
                    <td className="px-2 py-1 text-muted-foreground">{row.group_name}</td>
                    <td className="px-2 py-1 font-mono">{row.poz_code}</td>
                    <td className="px-2 py-1">{row.name}</td>
                    <td className="px-2 py-1">{row.unit}</td>
                    {canPrice && <td className="px-2 py-1 text-right">{row.unit_price}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{rows.length} satır okundu{rows.length > 50 ? " (ilk 50 gösteriliyor)" : ""}</p>
        <Footer saving={saving} onClose={onClose} onSave={save} label="Aktar" disabled={!rows.length} />
      </DialogContent>
    </Dialog>
  );
}

function CatalogPickDialog({ catalog, existing, repository, onClose, onSaved }: { catalog: PozList["catalogs"][number]; existing: PozItem[]; repository: RepoFactory; onClose: () => void; onSaved: () => void }) {
  const names = new Set(existing.map((item) => lower(item.name)));
  const options = catalog.items.map((item, index) => ({ ...item, key: index, exists: names.has(lower(item.name)) }));
  const [selected, setSelected] = useState<Set<number>>(() => new Set(options.filter((item) => !item.exists).map((item) => item.key)));
  const { saving, run } = useSave(onSaved);

  function save() {
    const rows = options
      .filter((item) => selected.has(item.key))
      .map((item) => ({ group_name: item.group_name ?? "", poz_code: item.poz_code ?? "", name: item.name, unit: item.unit ?? "" }));
    if (!rows.length) return toast.error("Kalem seçin");
    void run(() => repository().importItems(catalog.id, rows, todayISODate()), `${rows.length} poz eklendi`);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{catalog.name} · önerilen kalemler</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Seçtiğiniz kalemler poz listesine eklenir. Poz no ve fiyatı sonra girebilirsiniz.</p>
        <ul className="divide-y rounded-lg border text-sm">
          {options.map((item) => (
            <li key={item.key} className={cn("flex items-center gap-3 px-3 py-2", item.exists && "opacity-50")}>
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                disabled={item.exists}
                checked={selected.has(item.key)}
                onChange={(event) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(item.key);
                    else next.delete(item.key);
                    return next;
                  })
                }
              />
              <span className="min-w-0 flex-1">
                {item.poz_code && <span className="mr-2 font-mono text-xs">{item.poz_code}</span>}
                {item.name}
                {item.group_name && <span className="ml-2 text-xs text-muted-foreground">{item.group_name}</span>}
              </span>
              <span className="text-xs text-muted-foreground">{item.exists ? "Listede var" : item.unit}</span>
            </li>
          ))}
        </ul>
        <Footer saving={saving} onClose={onClose} onSave={save} label={`Seçilenleri ekle (${selected.size})`} disabled={!selected.size} />
      </DialogContent>
    </Dialog>
  );
}

function BulkDialog({
  catalogs,
  catalogId,
  items,
  pricesByStage,
  currency,
  repository,
  onClose,
  onSaved,
}: {
  catalogs: PozList["catalogs"];
  catalogId: string;
  items: PozItem[];
  pricesByStage: Map<string, PozPrice[]>;
  currency: CurrencyCode;
  repository: RepoFactory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState({ catalogId, groupName: "", percent: "", validFrom: todayISODate() });
  const { saving, run } = useSave(onSaved);
  const percent = toNumber(scope.percent);
  const groups = [...new Set(items.filter((item) => !scope.catalogId || item.catalog_id === scope.catalogId).map((item) => item.group_name).filter((group): group is string => !!group))];
  const preview = items
    .filter(
      (item) =>
        item.is_active &&
        (!scope.catalogId || item.catalog_id === scope.catalogId) &&
        (!scope.groupName || lower(item.group_name) === lower(scope.groupName))
    )
    .map((item) => {
      const base = priceAt(pricesByStage.get(item.id) ?? [], scope.validFrom);
      return { item, base: base?.unit_price ?? null, next: base && percent !== null ? Math.round(base.unit_price * (1 + percent / 100) * 100) / 100 : null };
    })
    .filter((row) => row.base !== null);

  function save() {
    if (percent === null || Number.isNaN(percent) || percent === 0 || percent < -90 || percent > 500) return toast.error("Yüzde -90 ile 500 arasında ve sıfırdan farklı olmalı");
    if (!scope.validFrom) return toast.error("Yürürlük tarihini girin");
    if (!preview.length) return toast.error("Kapsamda fiyatı olan poz yok");
    if (!window.confirm(`${preview.length} pozun fiyatı %${percent} değişecek (${formatDate(scope.validFrom)}'den geçerli). Onaylıyor musunuz?`)) return;
    void run(
      () => repository().bulkAdjust({ catalogId: scope.catalogId || null, groupName: scope.groupName || null, percent, validFrom: scope.validFrom }),
      `${preview.length} pozun fiyatı güncellendi`
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Toplu fiyat güncelle (eskalasyon)</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-2 sm:col-span-2">
            <Label>Katalog</Label>
            <NativeSelect value={scope.catalogId} onChange={(event) => setScope({ ...scope, catalogId: event.target.value, groupName: "" })}>
              <option value="">Bütün kataloglar</option>
              {catalogs.map((catalog) => <option key={catalog.id} value={catalog.id}>{catalog.name}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Grup</Label>
            <NativeSelect value={scope.groupName} onChange={(event) => setScope({ ...scope, groupName: event.target.value })}>
              <option value="">Bütün gruplar</option>
              {groups.map((group) => <option key={group} value={group}>{group}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Yüzde (artış; azalış için eksi)</Label>
            <Input value={scope.percent} onChange={(event) => setScope({ ...scope, percent: event.target.value })} inputMode="decimal" placeholder="Örn. 4,5" autoFocus />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Yürürlük tarihi</Label>
            <Input type="date" value={scope.validFrom} onChange={(event) => setScope({ ...scope, validFrom: event.target.value })} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Her pozun bu tarihte geçerli fiyatı baz alınır; yeni fiyat bu tarihten itibaren geçerli olur, önceki işler eski fiyattan kalır.
          Fiyatı olmayan ve pasif pozlar atlanır.
        </p>
        <div className="max-h-64 overflow-y-auto rounded-lg border text-sm">
          {preview.length === 0 ? (
            <p className="p-4 text-center text-muted-foreground">Kapsamda fiyatı olan poz yok.</p>
          ) : (
            <table className="w-full">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Poz</th>
                  <th className="px-3 py-2 text-right font-medium">Eski</th>
                  <th className="px-3 py-2 text-right font-medium">Yeni</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.map(({ item, base, next }) => (
                  <tr key={item.id}>
                    <td className="px-3 py-1.5">{item.poz_code ? `${item.poz_code} · ` : ""}{item.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{formatMoney(base, currency)}</td>
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums">{next === null ? "—" : formatMoney(next, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Footer saving={saving} onClose={onClose} onSave={save} label={`Uygula (${preview.length} poz)`} disabled={!preview.length} />
      </DialogContent>
    </Dialog>
  );
}
