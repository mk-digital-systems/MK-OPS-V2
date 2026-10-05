"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CarFront, Download, Fuel, Gauge, Loader2, Pencil, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import type { Vehicle, VehicleFuelLog } from "@/types/vehicle";
import type { Personnel } from "@/types/work-plan";
import type { InventoryCustodyBalance } from "@/types/inventory";
import { downloadVehicleEquipmentWord } from "@/lib/vehicle-equipment-word";
import {
  vehicleSchema,
  type VehicleFormValues,
} from "@/lib/validations/vehicle";
import { formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function VehiclesManager({
  initialVehicles,
  equipmentBalances,
  initialFuelLogs,
  personnel,
  readOnly = false,
}: {
  initialVehicles: Vehicle[];
  equipmentBalances: InventoryCustodyBalance[];
  initialFuelLogs: VehicleFuelLog[];
  personnel: Personnel[];
  readOnly?: boolean;
}) {
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [fuelLogs, setFuelLogs] = useState(initialFuelLogs);
  const [fuelVehicle, setFuelVehicle] = useState<Vehicle | null>(null);
  const [assignmentVehicle, setAssignmentVehicle] = useState<Vehicle | null>(null);
  const [assignedPersonnelId, setAssignedPersonnelId] = useState("none");
  const [fuelForm, setFuelForm] = useState({ date: new Date().toISOString().slice(0, 10), km: "", liters: "", notes: "" });
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [reportMonth, setReportMonth] = useState(currentMonth);
  const [dateFrom, setDateFrom] = useState(`${currentMonth}-01`);
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      plate: "",
      brand: "",
      model: "",
      current_km: 0,
      inspection_date: "",
      insurance_date: "",
      notes: "",
    },
  });

  function openCreate() {
    setEditing(null);
    form.reset({
      plate: "",
      brand: "",
      model: "",
      current_km: 0,
      inspection_date: "",
      insurance_date: "",
      notes: "",
    });
    setOpen(true);
  }

  function openEdit(vehicle: Vehicle) {
    setEditing(vehicle);
    form.reset({
      plate: vehicle.plate,
      brand: vehicle.brand,
      model: vehicle.model,
      current_km: vehicle.current_km,
      inspection_date: vehicle.inspection_date ?? "",
      insurance_date: vehicle.insurance_date ?? "",
      notes: vehicle.notes ?? "",
    });
    setOpen(true);
  }

  function openFuel(vehicle: Vehicle) {
    setFuelVehicle(vehicle);
    setFuelForm({ date: new Date().toISOString().slice(0, 10), km: String(vehicle.current_km), liters: "", notes: "" });
  }

  function openAssignment(vehicle: Vehicle) {
    setAssignmentVehicle(vehicle);
    setAssignedPersonnelId(vehicle.assigned_personnel_id || "none");
  }

  async function saveAssignment() {
    if (!assignmentVehicle) return;
    setLoading(true);
    try {
      const updated = await new VehicleRepository(createClient()).assignPersonnel(
        assignmentVehicle.id, assignedPersonnelId === "none" ? null : assignedPersonnelId
      );
      setVehicles((current) => current.map((vehicle) => vehicle.id === updated.id ? updated : vehicle));
      setAssignmentVehicle(null); toast.success("Araç personel ataması güncellendi");
    } catch (error) { console.error(error); toast.error("Araç atanamadı", { description: (error as Error).message }); }
    finally { setLoading(false); }
  }

  async function saveFuel() {
    if (!fuelVehicle) return;
    const km = Number(fuelForm.km);
    const liters = Number(fuelForm.liters);
    if (!Number.isInteger(km) || km < fuelVehicle.current_km) { toast.error(`Kilometre en az ${fuelVehicle.current_km} olmalıdır`); return; }
    if (!Number.isFinite(liters) || liters <= 0) { toast.error("Geçerli litre girin"); return; }
    setLoading(true);
    try {
      const repository = new VehicleRepository(createClient());
      const created = await repository.recordFuelPurchase({ vehicle_id: fuelVehicle.id, fuel_date: fuelForm.date, odometer_km: km, liters, notes: fuelForm.notes });
      setFuelLogs((current) => [created, ...current]);
      setVehicles((current) => current.map((vehicle) => vehicle.id === fuelVehicle.id ? { ...vehicle, current_km: Math.max(vehicle.current_km, km) } : vehicle));
      setFuelVehicle(null); toast.success("Yakıt ve kilometre kaydı eklendi");
    } catch (error) { console.error(error); toast.error("Yakıt kaydı eklenemedi", { description: (error as Error).message }); }
    finally { setLoading(false); }
  }

  async function onSubmit(values: VehicleFormValues) {
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Oturum bulunamadı");

      const repository = new VehicleRepository(supabase);
      if (editing) {
        const updated = await repository.update(editing.id, {
          ...values,
          updated_by: user.id,
        });
        setVehicles((current) =>
          current
            .map((vehicle) => (vehicle.id === updated.id ? updated : vehicle))
            .sort((a, b) => a.plate.localeCompare(b.plate, "tr"))
        );
        toast.success("Araç güncellendi");
      } else {
        const created = await repository.create({
          ...values,
          created_by: user.id,
          updated_by: user.id,
        });
        setVehicles((current) =>
          [...current, created].sort((a, b) =>
            a.plate.localeCompare(b.plate, "tr")
          )
        );
        toast.success("Araç eklendi");
      }
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Araç kaydedilemedi", {
        description:
          (error as { code?: string })?.code === "23505"
            ? "Bu plaka zaten kayıtlı."
            : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  const query = search.trim().toLocaleLowerCase("tr-TR");
  const filtered = vehicles.filter((vehicle) =>
    [vehicle.plate, vehicle.brand, vehicle.model, vehicle.notes ?? ""].some(
      (value) => value.toLocaleLowerCase("tr-TR").includes(query)
    )
  );

  const fuelSummary = useMemo(() => vehicles.map((vehicle) => {
    const vehicleLogs = fuelLogs.filter((log) => log.vehicle_id === vehicle.id).sort((a, b) => a.fuel_date.localeCompare(b.fuel_date) || a.created_at.localeCompare(b.created_at));
    const periodLogs = vehicleLogs.filter((log) => log.fuel_date >= dateFrom && log.fuel_date <= dateTo);
    const baseline = vehicleLogs.filter((log) => log.fuel_date < dateFrom).at(-1);
    const firstKm = baseline?.odometer_km ?? periodLogs[0]?.odometer_km ?? 0;
    const lastKm = periodLogs.at(-1)?.odometer_km ?? firstKm;
    const distance = Math.max(0, lastKm - firstKm);
    const liters = periodLogs.reduce((sum, log) => sum + Number(log.liters), 0);
    return { vehicle, logs: periodLogs, distance, liters, consumption: distance > 0 ? liters / distance * 100 : null };
  }).filter((item) => item.logs.length > 0), [dateFrom, dateTo, fuelLogs, vehicles]);
  const periodFuelLogs = useMemo(() => fuelLogs
    .filter((log) => log.fuel_date >= dateFrom && log.fuel_date <= dateTo)
    .sort((a, b) => b.fuel_date.localeCompare(a.fuel_date) || b.created_at.localeCompare(a.created_at)),
  [dateFrom, dateTo, fuelLogs]);

  function applyMonth(month: string) {
    setReportMonth(month);
    if (!month) return;
    const [year, monthNumber] = month.split("-").map(Number);
    setDateFrom(`${month}-01`);
    setDateTo(`${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, "0")}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Araçlar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            İş planında kullanılacak şirket araçları
          </p>
        </div>
        {!readOnly && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Araç Ekle
          </Button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Yakıt ve Kilometre Raporu</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2"><Label>Ay Seç</Label><Input type="month" value={reportMonth} onChange={(event) => applyMonth(event.target.value)} /></div>
            <div className="space-y-2"><Label>Başlangıç Tarihi</Label><Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div>
            <div className="space-y-2"><Label>Bitiş Tarihi</Label><Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {fuelSummary.map(({ vehicle, logs, distance, liters, consumption }) => <div key={vehicle.id} className="rounded-xl border p-4">
              <p className="font-semibold">{vehicle.plate}</p><p className="text-xs text-muted-foreground">{logs.length} yakıt kaydı</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><span>Gidilen: <strong>{distance.toLocaleString("tr-TR")} km</strong></span><span>Yakıt: <strong>{liters.toLocaleString("tr-TR", { maximumFractionDigits: 3 })} L</strong></span></div>
              <p className="mt-2 text-xs text-muted-foreground">Ortalama: {consumption === null ? "Hesaplanamadı" : `${consumption.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} L/100 km`}</p>
            </div>)}
            {!fuelSummary.length && <p className="text-sm text-muted-foreground">Seçilen tarihlerde yakıt kaydı yok.</p>}
          </div>
          {periodFuelLogs.length > 0 && <div className="overflow-x-auto border-t pt-4"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="px-3 py-2">Tarih</th><th className="px-3 py-2">Araç</th><th className="px-3 py-2">Kilometre</th><th className="px-3 py-2">Yakıt</th><th className="px-3 py-2">Not</th></tr></thead><tbody>{periodFuelLogs.map((log) => <tr key={log.id} className="border-b last:border-0"><td className="px-3 py-2">{formatDate(log.fuel_date)}</td><td className="px-3 py-2 font-medium">{vehicles.find((vehicle) => vehicle.id === log.vehicle_id)?.plate || "—"}</td><td className="px-3 py-2">{Number(log.odometer_km).toLocaleString("tr-TR")} km</td><td className="px-3 py-2">{Number(log.liters).toLocaleString("tr-TR", { maximumFractionDigits: 3 })} L</td><td className="px-3 py-2">{log.notes || "—"}</td></tr>)}</tbody></table></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Şirket Araçları</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Plaka, marka veya model ara..."
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((vehicle) => (
              <div key={vehicle.id} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-primary/10 p-2 text-primary">
                      <CarFront className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold">{vehicle.plate}</p>
                      <p className="text-sm text-muted-foreground">
                        {vehicle.brand} {vehicle.model}
                      </p>
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="flex gap-1"><Button variant="outline" size="icon" onClick={() => openAssignment(vehicle)} aria-label="Aracı personele ata"><UserRound className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => openFuel(vehicle)} aria-label="Yakıt kaydı ekle"><Fuel className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => openEdit(vehicle)} aria-label="Aracı düzenle"><Pencil className="h-4 w-4" /></Button></div>
                  )}
                </div>
                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <span className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    {vehicle.current_km.toLocaleString("tr-TR")} km
                  </span>
                  <span>Muayene: {formatDate(vehicle.inspection_date)}</span>
                  <span>Sigorta: {formatDate(vehicle.insurance_date)}</span>
                  <span className="text-muted-foreground">
                    {vehicle.notes || "Not yok"}
                  </span>
                  <span className="sm:col-span-2">
                    Kullanan: <strong>{personnel.find((person) => person.id === vehicle.assigned_personnel_id)?.full_name || "Atanmadı"}</strong>
                  </span>
                </div>
                {(() => {
                  const vehicleEquipment = equipmentBalances.filter(
                    (balance) => balance.holder_id === vehicle.id
                  );
                  return (
                    <div className="mt-4 border-t pt-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">Zimmetli Ekipmanlar</p>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={vehicleEquipment.length === 0}
                          onClick={() => downloadVehicleEquipmentWord(vehicle, vehicleEquipment)}
                        >
                          <Download className="h-4 w-4" /> Word
                        </Button>
                      </div>
                      {vehicleEquipment.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-sm">
                          {vehicleEquipment.map((balance) => (
                            <li key={balance.id} className="flex justify-between gap-3 rounded-md bg-muted px-2 py-1.5">
                              <span>{balance.material?.material_name || "—"}</span>
                              <strong>{Number(balance.quantity).toLocaleString("tr-TR")} adet</strong>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">Bu araçta zimmetli ekipman yok.</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Araç bulunamadı.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Aracı Düzenle" : "Yeni Araç"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="plate">Araç Plakası</Label>
                <Input id="plate" {...form.register("plate")} />
                {form.formState.errors.plate && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.plate.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="current_km">Kilometre</Label>
                <Input
                  id="current_km"
                  type="number"
                  min={0}
                  {...form.register("current_km")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand">Marka</Label>
                <Input id="brand" {...form.register("brand")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input id="model" {...form.register("model")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inspection_date">Muayene Tarihi</Label>
                <Input
                  id="inspection_date"
                  type="date"
                  {...form.register("inspection_date")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="insurance_date">Sigorta Tarihi</Label>
                <Input
                  id="insurance_date"
                  type="date"
                  {...form.register("insurance_date")}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="vehicle_notes">Not</Label>
                <Textarea id="vehicle_notes" {...form.register("notes")} />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Kaydet
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(fuelVehicle)} onOpenChange={(value) => !value && setFuelVehicle(null)}>
        <DialogContent><DialogHeader><DialogTitle>Yakıt Alımı · {fuelVehicle?.plate}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Yakıt Tarihi</Label><Input type="date" max={new Date().toISOString().slice(0, 10)} value={fuelForm.date} onChange={(event) => setFuelForm((value) => ({ ...value, date: event.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Yeni Kilometre</Label><Input type="number" min={fuelVehicle?.current_km ?? 0} step="1" value={fuelForm.km} onChange={(event) => setFuelForm((value) => ({ ...value, km: event.target.value }))} /></div>
              <div className="space-y-2"><Label>Alınan Yakıt (Litre)</Label><Input type="number" min="0.001" step="0.001" value={fuelForm.liters} onChange={(event) => setFuelForm((value) => ({ ...value, liters: event.target.value }))} /></div></div>
            <div className="space-y-2"><Label>Not</Label><Textarea value={fuelForm.notes} onChange={(event) => setFuelForm((value) => ({ ...value, notes: event.target.value }))} /></div>
            <Button className="w-full" disabled={loading} onClick={saveFuel}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}Yakıt Kaydını Ekle</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(assignmentVehicle)} onOpenChange={(value) => !value && setAssignmentVehicle(null)}>
        <DialogContent><DialogHeader><DialogTitle>Aracı Personele Ata · {assignmentVehicle?.plate}</DialogTitle></DialogHeader>
          <div className="space-y-4"><div className="space-y-2"><Label>Aracı Kullanan Personel</Label>
            <Select value={assignedPersonnelId} onValueChange={setAssignedPersonnelId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Personel Atama</SelectItem>{personnel.map((person) => <SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>)}</SelectContent></Select>
          </div><Button className="w-full" disabled={loading} onClick={saveAssignment}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}Atamayı Kaydet</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
