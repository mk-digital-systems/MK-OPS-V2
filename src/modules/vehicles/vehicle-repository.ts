import type { SupabaseClient } from "@supabase/supabase-js";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import type {
  Vehicle,
  VehicleDeadlineAlert,
  VehicleInput,
  VehicleUpdate,
  VehicleFuelLog,
} from "@/types/vehicle";

function emptyToNull(value?: string | null) {
  if (!value?.trim()) return null;
  return value.trim();
}

export class VehicleRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(): Promise<Vehicle[]> {
    const { data, error } = await this.supabase
      .from("vehicles")
      .select("*")
      .order("plate");
    if (error) throw error;
    return (data ?? []) as Vehicle[];
  }

  async getDeadlineAlerts(): Promise<VehicleDeadlineAlert[]> {
    const today = new Date();
    const warningLimit = format(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15),
      "yyyy-MM-dd"
    );
    const { data, error } = await this.supabase
      .from("vehicles")
      .select("id, plate, brand, model, inspection_date, insurance_date")
      .or(
        `inspection_date.lte.${warningLimit},insurance_date.lte.${warningLimit}`
      );
    if (error) throw error;

    const alerts: VehicleDeadlineAlert[] = [];
    for (const vehicle of data ?? []) {
      const deadlines = [
        {
          type: "inspection" as const,
          date: vehicle.inspection_date as string | null,
        },
        {
          type: "insurance" as const,
          date: vehicle.insurance_date as string | null,
        },
      ];
      for (const deadline of deadlines) {
        if (!deadline.date) continue;
        const daysRemaining = differenceInCalendarDays(
          parseISO(deadline.date),
          today
        );
        if (daysRemaining > 15) continue;
        alerts.push({
          vehicle_id: vehicle.id as string,
          plate: vehicle.plate as string,
          brand: vehicle.brand as string,
          model: vehicle.model as string,
          deadline_type: deadline.type,
          deadline_date: deadline.date,
          days_remaining: daysRemaining,
        });
      }
    }

    return alerts.sort((a, b) => a.days_remaining - b.days_remaining);
  }

  async create(payload: VehicleInput): Promise<Vehicle> {
    const { data, error } = await this.supabase
      .from("vehicles")
      .insert({
        plate: payload.plate.trim().toLocaleUpperCase("tr-TR"),
        brand: payload.brand.trim(),
        model: payload.model.trim(),
        current_km: payload.current_km,
        notes: emptyToNull(payload.notes),
        inspection_date: emptyToNull(payload.inspection_date),
        insurance_date: emptyToNull(payload.insurance_date),
        created_by: payload.created_by ?? null,
        updated_by: payload.updated_by ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as Vehicle;
  }

  async update(id: string, payload: VehicleUpdate): Promise<Vehicle> {
    const updatePayload: Record<string, unknown> = {
      updated_by: payload.updated_by ?? null,
    };
    if (payload.plate !== undefined)
      updatePayload.plate = payload.plate
        .trim()
        .toLocaleUpperCase("tr-TR");
    if (payload.brand !== undefined)
      updatePayload.brand = payload.brand.trim();
    if (payload.model !== undefined)
      updatePayload.model = payload.model.trim();
    if (payload.current_km !== undefined)
      updatePayload.current_km = payload.current_km;
    if (payload.notes !== undefined)
      updatePayload.notes = emptyToNull(payload.notes);
    if (payload.inspection_date !== undefined)
      updatePayload.inspection_date = emptyToNull(payload.inspection_date);
    if (payload.insurance_date !== undefined)
      updatePayload.insurance_date = emptyToNull(payload.insurance_date);

    const { data, error } = await this.supabase
      .from("vehicles")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as Vehicle;
  }

  async listFuelLogs(): Promise<VehicleFuelLog[]> {
    const { data, error } = await this.supabase
      .from("vehicle_fuel_logs")
      .select("*")
      .order("fuel_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as VehicleFuelLog[];
  }

  async recordFuelPurchase(payload: {
    vehicle_id: string;
    fuel_date: string;
    odometer_km: number;
    liters: number;
    notes?: string;
  }): Promise<VehicleFuelLog> {
    const { data, error } = await this.supabase.rpc("record_vehicle_fuel_purchase", {
      p_vehicle_id: payload.vehicle_id,
      p_fuel_date: payload.fuel_date,
      p_odometer_km: payload.odometer_km,
      p_liters: payload.liters,
      p_notes: payload.notes || null,
    });
    if (error) throw error;
    return data as VehicleFuelLog;
  }

  async assignPersonnel(vehicleId: string, personnelId: string | null): Promise<Vehicle> {
    const { data, error } = await this.supabase.rpc("assign_vehicle_personnel", {
      p_vehicle_id: vehicleId,
      p_personnel_id: personnelId,
    });
    if (error) throw error;
    return data as Vehicle;
  }
}
