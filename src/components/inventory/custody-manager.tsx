"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft, CarFront, Loader2, Plus, Warehouse } from "lucide-react";
import { toast } from "sonner";
import type { Vehicle } from "@/types/vehicle";
import type { CustodyLocationType, InventoryCustodyBalance, InventoryCustodyMovement, InventoryMaterial } from "@/types/inventory";
import { formatDateTime } from "@/lib/utils";
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

type TransferSource = { type: CustodyLocationType; balance: InventoryCustodyBalance | null };

export function CustodyManager({ initialMaterials, initialBalances, initialMovements, vehicles, readOnly = false }: {
  initialMaterials: InventoryMaterial[];
  initialBalances: InventoryCustodyBalance[];
  initialMovements: InventoryCustodyMovement[];
  vehicles: Vehicle[];
  readOnly?: boolean;
}) {
  const [materials, setMaterials] = useState(initialMaterials);
  const [balances, setBalances] = useState(initialBalances);
  const [movements, setMovements] = useState(initialMovements);
  const [source, setSource] = useState<TransferSource | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [materialId, setMaterialId] = useState("");
  const [targetType, setTargetType] = useState<"warehouse" | "vehicle">("vehicle");
  const [targetId, setTargetId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", quantity: "1", location: "warehouse", vehicleId: "", notes: "" });

  const equipmentBalances = balances.filter((balance) => materials.some((item) => item.id === balance.material_id));
  const totals = useMemo(() => materials.map((material) => ({
    material,
    assigned: equipmentBalances.filter((balance) => balance.material_id === material.id).reduce((sum, balance) => sum + Number(balance.quantity), 0),
  })), [equipmentBalances, materials]);

  async function reload(repository: InventoryRepository) {
    const [nextMaterials, nextBalances, nextMovements] = await Promise.all([
      repository.listMaterials("equipment"), repository.listCustodyBalances(), repository.listCustodyMovements(),
    ]);
    setMaterials(nextMaterials); setBalances(nextBalances); setMovements(nextMovements);
  }

  function openWarehouseAssignment() {
    setSource({ type: "warehouse", balance: null }); setMaterialId(""); setTargetType("vehicle");
    setTargetId(""); setQuantity("1"); setNotes("");
  }

  function openTransfer(balance: InventoryCustodyBalance) {
    setSource({ type: balance.holder_type, balance }); setMaterialId(balance.material_id);
    setTargetType("warehouse"); setTargetId(""); setQuantity("1"); setNotes("");
  }

  async function createMaterial() {
    const amount = Number(newItem.quantity);
    if (newItem.name.trim().length < 2 || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Malzeme adı ve geçerli miktar zorunlu"); return;
    }
    if (!Number.isInteger(amount)) { toast.error("Adet tam sayı olmalıdır"); return; }
    if (newItem.location === "vehicle" && !newItem.vehicleId) { toast.error("Araç seçin"); return; }
    setLoading(true);
    try {
      const repository = new InventoryRepository(createClient());
      await repository.createCustodyMaterial({ material_name: newItem.name,
        unit: "piece", initial_quantity: amount,
        vehicle_id: newItem.location === "vehicle" ? newItem.vehicleId : null, notes: newItem.notes });
      await reload(repository); setCreateOpen(false);
      setNewItem({ name: "", quantity: "1", location: "warehouse", vehicleId: "", notes: "" });
      toast.success("Yeni araç ekipmanı kaydedildi");
    } catch (error) { console.error(error); toast.error("Ekipman kaydedilemedi", { description: (error as Error).message }); }
    finally { setLoading(false); }
  }

  async function submitTransfer() {
    if (!source || !materialId) return;
    const amount = Number(quantity);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      toast.error("Geçerli bir miktar girin"); return;
    }
    if (targetType === "vehicle" && !targetId) { toast.error("Araç seçin"); return; }
    setLoading(true);
    try {
      const repository = new InventoryRepository(createClient());
      await repository.transferCustody({ material_id: materialId, quantity: amount,
        from_type: source.type, from_id: source.balance?.holder_id ?? null,
        to_type: targetType, to_id: targetType === "vehicle" ? targetId : null, notes });
      await reload(repository); setSource(null); toast.success("Ekipman konumu güncellendi");
    } catch (error) { console.error(error); toast.error("Aktarım kaydedilemedi", { description: (error as Error).message }); }
    finally { setLoading(false); }
  }

  const selectedMaterial = materials.find((item) => item.id === materialId);
  const maxQuantity = source?.type === "warehouse" ? Number(selectedMaterial?.stock_quantity ?? 0) : Number(source?.balance?.quantity ?? 0);

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-3xl font-semibold tracking-tight">Araç Ekipmanları</h1>
        <p className="mt-1 text-sm text-muted-foreground">El aletleri ve ekipmanların şantiye deposu ile araçlar arasındaki takibi</p></div>
      {!readOnly && <div className="flex gap-2"><Button variant="outline" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Yeni Ekipman</Button>
        <Button onClick={openWarehouseAssignment}><CarFront className="h-4 w-4" />Araca Zimmetle</Button></div>}
    </div>

    <Card><CardHeader><CardTitle className="text-base">Tüm Ekipmanlar</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{totals.map(({ material, assigned }) => <div key={material.id} className="rounded-xl border p-4">
        <div className="flex justify-between gap-3"><p className="font-semibold">{material.material_name}</p>
          <Badge>Toplam {formatEquipmentQuantity(Number(material.stock_quantity) + assigned)}</Badge></div>
        <div className="mt-3 grid grid-cols-2 text-sm"><span>Depo: <strong>{formatEquipmentQuantity(material.stock_quantity)}</strong></span><span>Araçlarda: <strong>{formatEquipmentQuantity(assigned)}</strong></span></div>
      </div>)}{!totals.length && <p className="text-sm text-muted-foreground">Henüz araç ekipmanı eklenmedi.</p>}</CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base">Araç ve Depo Dağılımı</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {equipmentBalances.map((balance) => <div key={balance.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold">{balance.holder_name}</p><p className="text-sm text-muted-foreground">{balance.material?.material_name}</p></div><Badge>{formatEquipmentQuantity(balance.quantity)}</Badge></div>
        <p className="mt-2 text-xs text-muted-foreground">{balance.holder_type === "vehicle" ? "Araç" : "Eski zimmet kaydı"}</p>
        {!readOnly && <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => openTransfer(balance)}><ArrowRightLeft className="h-4 w-4" />Aktar / Depoya İade</Button>}</div>)}
      {!equipmentBalances.length && <p className="text-sm text-muted-foreground">Araçlara zimmetli ekipman yok.</p>}
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base">Son Ekipman Hareketleri</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="px-3 py-2">Tarih</th><th className="px-3 py-2">Malzeme</th><th className="px-3 py-2">Kaynak</th><th className="px-3 py-2">Hedef</th><th className="px-3 py-2">Miktar</th><th className="px-3 py-2">Not</th></tr></thead><tbody>{movements.filter((m) => materials.some((x) => x.id === m.material_id)).map((movement) => <tr key={movement.id} className="border-b"><td className="px-3 py-3">{formatDateTime(movement.created_at)}</td><td className="px-3 py-3 font-medium">{movement.material?.material_name}</td><td className="px-3 py-3">{movement.from_name}</td><td className="px-3 py-3">{movement.to_name}</td><td className="px-3 py-3">{movement.quantity}</td><td className="px-3 py-3">{movement.notes || "—"}</td></tr>)}</tbody></table></div></CardContent></Card>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Yeni Araç Ekipmanı</DialogTitle></DialogHeader><div className="space-y-4">
      <Field label="Malzeme Adı"><Input value={newItem.name} onChange={(e) => setNewItem((v) => ({ ...v, name: e.target.value }))} placeholder="Merdiven, jeneratör, pense..." /></Field>
      <Field label="Miktar (Adet)"><Input type="number" min="1" step="1" value={newItem.quantity} onChange={(e) => setNewItem((v) => ({ ...v, quantity: e.target.value }))} /></Field>
      <Field label="İlk Konum"><Select value={newItem.location} onValueChange={(location) => setNewItem((v) => ({ ...v, location, vehicleId: "" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="warehouse">Şantiye Deposu</SelectItem><SelectItem value="vehicle">Araç</SelectItem></SelectContent></Select></Field>
      {newItem.location === "vehicle" && <VehicleSelect vehicles={vehicles} value={newItem.vehicleId} onChange={(vehicleId) => setNewItem((v) => ({ ...v, vehicleId }))} />}
      <Field label="Not"><Textarea value={newItem.notes} onChange={(e) => setNewItem((v) => ({ ...v, notes: e.target.value }))} /></Field><Button className="w-full" disabled={loading} onClick={createMaterial}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}Kaydet</Button>
    </div></DialogContent></Dialog>

    <Dialog open={Boolean(source)} onOpenChange={(open) => !open && setSource(null)}><DialogContent><DialogHeader><DialogTitle>{source?.type === "warehouse" ? "Depodan Araca Zimmetle" : "Ekipmanı Aktar"}</DialogTitle></DialogHeader>{source && <div className="space-y-4">
      {source.type === "warehouse" ? <Field label="Malzeme"><Select value={materialId} onValueChange={setMaterialId}><SelectTrigger><SelectValue placeholder="Malzeme seçin" /></SelectTrigger><SelectContent>{materials.filter((m) => Number(m.stock_quantity) > 0).map((m) => <SelectItem key={m.id} value={m.id}>{m.material_name} · {formatEquipmentQuantity(m.stock_quantity)}</SelectItem>)}</SelectContent></Select></Field> : <div className="rounded-xl bg-muted p-3 text-sm"><strong>{source.balance?.holder_name}</strong><p>{source.balance?.material?.material_name}</p></div>}
      <Field label="Hedef"><Select value={targetType} onValueChange={(value: "warehouse" | "vehicle") => { setTargetType(value); setTargetId(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="warehouse"><Warehouse className="mr-2 inline h-4 w-4" />Şantiye Deposu</SelectItem><SelectItem value="vehicle">Araç</SelectItem></SelectContent></Select></Field>
      {targetType === "vehicle" && <VehicleSelect vehicles={vehicles.filter((v) => source.balance?.holder_id !== v.id)} value={targetId} onChange={setTargetId} />}
      <Field label={`Miktar (Adet, en fazla ${maxQuantity})`}><Input type="number" min="1" step="1" max={maxQuantity} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field><Field label="Not"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field><Button className="w-full" disabled={loading || !materialId} onClick={submitTransfer}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}İşlemi Kaydet</Button>
    </div>}</DialogContent></Dialog>
  </div>;
}

function VehicleSelect({ vehicles, value, onChange }: { vehicles: Vehicle[]; value: string; onChange: (value: string) => void }) {
  return <Field label="Araç"><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder="Araç seçin" /></SelectTrigger><SelectContent>{vehicles.map((vehicle) => <SelectItem key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.brand} {vehicle.model}</SelectItem>)}</SelectContent></Select></Field>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }

function formatEquipmentQuantity(quantity: number) {
  return `${Number(quantity).toLocaleString("tr-TR")} adet`;
}
