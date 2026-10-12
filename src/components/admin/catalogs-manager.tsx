"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, ListChecks, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { SCREEN_LABELS, type Catalog, type CatalogItem, type CatalogType } from "@/types/admin";
import { PROJECT_TYPE_COLORS } from "@/lib/constants/project";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

const repository = () => new AdminRepository(createClient());

type CatalogDraft = { id: string | null; name: string; description: string };
type TypeDraft = { id: string | null; catalogId: string; name: string; screen: CatalogType["screen"]; color: string; description: string };

/** Süper admin: sektör katalogları, proje türleri ve önerilen kalemler. */
export function CatalogsManager({ catalogs }: { catalogs: Catalog[] }) {
  const router = useRouter();
  const [catalogDraft, setCatalogDraft] = useState<CatalogDraft | null>(null);
  const [typeDraft, setTypeDraft] = useState<TypeDraft | null>(null);
  const [itemsCatalog, setItemsCatalog] = useState<Catalog | null>(null);

  async function run(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      toast.success(message);
      router.refresh();
    } catch (error) {
      toast.error("İşlem yapılamadı", { description: (error as Error)?.message });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Kataloglar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sektör katalogları: proje türleri ve önerilen kalemler. Katalog firmaya Şirketler → Yönet&apos;ten atanır; atanınca türleri
            firmaya kurulur, burada yapılan değişiklikler atanmış firmalara yansır.
          </p>
        </div>
        <Button onClick={() => setCatalogDraft({ id: null, name: "", description: "" })}>
          <Plus className="h-4 w-4" />
          Yeni katalog
        </Button>
      </div>

      {catalogs.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">Henüz katalog yok.</CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {catalogs.map((catalog) => (
          <Card key={catalog.id}>
            <CardHeader className="flex flex-row flex-wrap items-start gap-2 space-y-0">
              <div className="min-w-0 flex-1">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {catalog.name}
                  {catalog.is_builtin && <Badge className="bg-muted text-muted-foreground">Hazır</Badge>}
                  <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">{catalog.company_ids.length} firma</Badge>
                </CardTitle>
                {catalog.description && <p className="mt-1 text-sm text-muted-foreground">{catalog.description}</p>}
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Kataloğu düzenle"
                  onClick={() => setCatalogDraft({ id: catalog.id, name: catalog.name, description: catalog.description ?? "" })}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Kataloğu sil"
                  disabled={catalog.company_ids.length > 0}
                  title={catalog.company_ids.length > 0 ? "Firmalara atanmış katalog silinemez" : undefined}
                  onClick={() =>
                    window.confirm(`${catalog.name} kataloğu silinsin mi?`) &&
                    run(() => repository().deleteCatalog(catalog.id), "Katalog silindi")
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Proje türleri</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setTypeDraft({
                        id: null,
                        catalogId: catalog.id,
                        name: "",
                        screen: "standard",
                        color: PROJECT_TYPE_COLORS[catalog.types.length % PROJECT_TYPE_COLORS.length],
                        description: "",
                      })
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Tür ekle
                  </Button>
                </div>
                {catalog.types.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tür yok.</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {catalog.types.map((type) => (
                      <li key={type.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: type.color || "#94a3b8" }} />
                        <span className="min-w-0 flex-1 truncate font-medium">{type.name}</span>
                        <span className="text-xs text-muted-foreground">{SCREEN_LABELS[type.screen]}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Türü düzenle"
                          onClick={() =>
                            setTypeDraft({
                              id: type.id,
                              catalogId: catalog.id,
                              name: type.name,
                              screen: type.screen,
                              color: type.color ?? "",
                              description: type.description ?? "",
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Türü sil"
                          onClick={() =>
                            window.confirm(`${type.name} türü katalogdan silinsin mi? Firmalardaki kopyaları arşivlenir, projeleri korunur.`) &&
                            run(() => repository().deleteCatalogType(type.id), "Tür silindi")
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Önerilen kalemler</h3>
                  <p className="text-xs text-muted-foreground">{catalog.items.length} kalem · firmaya poz listesi kurulurken kullanılır</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setItemsCatalog(catalog)}>
                  <ListChecks className="h-4 w-4" />
                  Kalemleri düzenle
                </Button>
              </section>
            </CardContent>
          </Card>
        ))}
      </div>

      {catalogDraft && (
        <CatalogDialog
          draft={catalogDraft}
          onClose={() => setCatalogDraft(null)}
          onSaved={() => {
            setCatalogDraft(null);
            router.refresh();
          }}
        />
      )}
      {typeDraft && (
        <TypeDialog
          draft={typeDraft}
          onClose={() => setTypeDraft(null)}
          onSaved={() => {
            setTypeDraft(null);
            router.refresh();
          }}
        />
      )}
      {itemsCatalog && (
        <ItemsDialog
          catalog={itemsCatalog}
          onClose={() => setItemsCatalog(null)}
          onSaved={() => {
            setItemsCatalog(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CatalogDialog({ draft: initial, onClose, onSaved }: { draft: CatalogDraft; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (draft.name.trim().length < 2) return toast.error("Katalog adı en az 2 karakter olmalı");
    setSaving(true);
    try {
      await repository().saveCatalog(draft);
      toast.success(draft.id ? "Katalog güncellendi" : "Katalog oluşturuldu");
      onSaved();
    } catch (error) {
      toast.error("Kaydedilemedi", { description: (error as Error)?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Kataloğu düzenle" : "Yeni katalog"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Katalog adı</Label>
            <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Örn. Doğalgaz Altyapı, Kuaför" autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Açıklama (isteğe bağlı)</Label>
            <Textarea rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
        </div>
        <DialogButtons saving={saving} onClose={onClose} onSave={save} />
      </DialogContent>
    </Dialog>
  );
}

function TypeDialog({ draft: initial, onClose, onSaved }: { draft: TypeDraft; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (draft.name.trim().length < 2) return toast.error("Tür adı en az 2 karakter olmalı");
    setSaving(true);
    try {
      await repository().saveCatalogType(draft);
      toast.success(draft.id ? "Tür güncellendi; atanmış firmalara yansıdı" : "Tür eklendi; atanmış firmalara kuruldu");
      onSaved();
    } catch (error) {
      toast.error("Kaydedilemedi", { description: (error as Error)?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Türü düzenle" : "Tür ekle"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tür adı</Label>
            <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Örn. Kaba İnşaat" autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Ekran tipi</Label>
            <NativeSelect
              value={draft.screen}
              disabled={!!draft.id}
              onChange={(event) => setDraft({ ...draft, screen: event.target.value as CatalogType["screen"] })}
            >
              {(Object.keys(SCREEN_LABELS) as CatalogType["screen"][]).map((screen) => (
                <option key={screen} value={screen}>
                  {SCREEN_LABELS[screen]}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              {draft.id ? "Ekran tipi sonradan değişmez." : "Standart: iş kalemi ve keşifle. HP odaklı: paftalar ve HP. Kurumsal: durum elle seçilir."}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Renk</Label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_TYPE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setDraft({ ...draft, color })}
                  className={cn("h-7 w-7 rounded-full border-2", draft.color === color ? "border-foreground" : "border-transparent")}
                  style={{ backgroundColor: color }}
                  aria-label={`Renk ${color}`}
                />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Açıklama (isteğe bağlı)</Label>
            <Input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
        </div>
        <DialogButtons saving={saving} onClose={onClose} onSave={save} />
      </DialogContent>
    </Dialog>
  );
}

type ItemRow = { key: string; group_name: string; poz_code: string; name: string; unit: string };
const makeKey = () => Math.random().toString(36).slice(2);
const toRow = (item: CatalogItem): ItemRow => ({
  key: item.id ?? makeKey(),
  group_name: item.group_name ?? "",
  poz_code: item.poz_code ?? "",
  name: item.name,
  unit: item.unit ?? "",
});

/** Excel'den kopyalanan satırlar: Grup · Poz · Kalem · Birim (sekme veya noktalı virgülle ayrılmış). */
function parseItemRows(text: string): ItemRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(line.includes("\t") ? "\t" : ";").map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean))
    .filter((cells, index) => !(index === 0 && /kalem|grup/i.test(cells.join(" ")) && /birim/i.test(cells.join(" "))))
    .map((cells) => ({ key: makeKey(), group_name: cells[0] ?? "", poz_code: cells[1] ?? "", name: cells[2] ?? "", unit: cells[3] ?? "" }))
    .filter((row) => row.name);
}

function ItemsDialog({ catalog, onClose, onSaved }: { catalog: Catalog; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<ItemRow[]>(() => catalog.items.map(toRow));
  const [pasteText, setPasteText] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const patch = (index: number, change: Partial<ItemRow>) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...change } : row)));
  const parsed = parseItemRows(pasteText);

  async function save() {
    const empty = rows.findIndex((row) => !row.name.trim());
    if (empty >= 0) return toast.error(`${empty + 1}. kalemin adı boş olamaz`);
    setSaving(true);
    try {
      await repository().saveCatalogItems(
        catalog.id,
        rows.map((row) => ({
          group_name: row.group_name.trim() || null,
          poz_code: row.poz_code.trim() || null,
          name: row.name.trim(),
          unit: row.unit.trim() || null,
        }))
      );
      toast.success("Önerilen kalemler kaydedildi");
      onSaved();
    } catch (error) {
      toast.error("Kaydedilemedi", { description: (error as Error)?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{catalog.name} · önerilen kalemler</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Firmanın poz listesi kurulurken bu kalemler önerilir. Poz no boş bırakılabilir; firmaya göre ayrıca girilir.
        </p>

        {pasteOpen ? (
          <div className="space-y-2 rounded-xl border p-3">
            <Label>Excel&apos;den yapıştır (sütunlar: Grup · Poz · Kalem · Birim)</Label>
            <Textarea rows={6} value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder={"Kablo\t1/1\tBlokta kablo çekimi\tm\nKablo\t1/2\tYeraltı kablo çekimi\tm"} autoFocus />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-xs text-muted-foreground">{parsed.length} kalem okundu</span>
              <Button variant="ghost" size="sm" onClick={() => setPasteOpen(false)}>
                Vazgeç
              </Button>
              <Button size="sm" variant="outline" disabled={!parsed.length} onClick={() => { setRows((current) => [...current, ...parsed]); setPasteText(""); setPasteOpen(false); }}>
                Listeye ekle
              </Button>
              <Button size="sm" disabled={!parsed.length} onClick={() => { setRows(parsed); setPasteText(""); setPasteOpen(false); }}>
                Listeyi bununla değiştir
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste className="h-4 w-4" />
              Excel&apos;den yapıştır
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRows((current) => [...current, { key: makeKey(), group_name: current.at(-1)?.group_name ?? "", poz_code: "", name: "", unit: "" }])}>
              <Plus className="h-4 w-4" />
              Kalem ekle
            </Button>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Kalem yok.</p>
        ) : (
          <div className="space-y-1.5">
            <div className="hidden grid-cols-[140px_90px_minmax(0,1fr)_80px_36px] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
              <span>Grup</span>
              <span>Poz</span>
              <span>Kalem</span>
              <span>Birim</span>
              <span />
            </div>
            {rows.map((row, index) => (
              <div key={row.key} className="grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-[140px_90px_minmax(0,1fr)_80px_36px] sm:border-0 sm:p-0">
                <Input value={row.group_name} onChange={(event) => patch(index, { group_name: event.target.value })} placeholder="Grup" />
                <Input value={row.poz_code} onChange={(event) => patch(index, { poz_code: event.target.value })} placeholder="Poz" />
                <Input className="col-span-2 sm:col-span-1" value={row.name} onChange={(event) => patch(index, { name: event.target.value })} placeholder="Kalem adı" />
                <Input value={row.unit} onChange={(event) => patch(index, { unit: event.target.value })} placeholder="Birim" />
                <Button type="button" size="icon" variant="ghost" aria-label="Kalemi kaldır" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <DialogButtons saving={saving} onClose={onClose} onSave={save} />
      </DialogContent>
    </Dialog>
  );
}

function DialogButtons({ saving, onClose, onSave }: { saving: boolean; onClose: () => void; onSave: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" onClick={onClose}>
        Vazgeç
      </Button>
      <Button onClick={onSave} disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Kaydet
      </Button>
    </div>
  );
}
