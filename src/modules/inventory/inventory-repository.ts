import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InventoryMaterial,
  InventoryCustodyBalance,
  InventoryCustodyMovement,
  CustodyLocationType,
  CustodyTeamOption,
  InventoryMovement,
  InventoryMovementType,
  InventoryUnit,
  InventoryMaterialCategory,
  InventoryLocation,
  InventoryShipment,
  InventoryStockCategory,
  InventoryReceipt,
  InventoryCatalog,
  InventoryRequest,
} from "@/types/inventory";

export class InventoryRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listMaterials(category?: InventoryMaterialCategory): Promise<InventoryMaterial[]> {
    let query = this.supabase
      .from("inventory_materials")
      .select("*")
      .order("material_name");
    if (category) query = query.eq("material_category", category);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as InventoryMaterial[];
  }

  async createCustodyMaterial(payload: {
    material_name: string;
    material_code?: string;
    unit: InventoryUnit;
    initial_quantity: number;
    vehicle_id?: string | null;
    notes?: string;
  }): Promise<void> {
    const { error } = await this.supabase.rpc("create_custody_material", {
      p_material_name: payload.material_name,
      p_material_code: payload.material_code || null,
      p_unit: payload.unit,
      p_initial_quantity: payload.initial_quantity,
      p_vehicle_id: payload.vehicle_id || null,
      p_notes: payload.notes || null,
    });
    if (error) throw error;
  }

  async listMovements(limit = 100): Promise<InventoryMovement[]> {
    const { data, error } = await this.supabase
      .from("inventory_movements")
      .select(
        "*, material:inventory_materials!inner(material_name, material_code, unit, material_category)"
      )
      .eq("material.material_category", "stock")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as InventoryMovement[];
  }

  async createMaterial(payload: {
    material_name: string;
    material_code?: string;
    unit: InventoryUnit;
    initial_quantity: number;
    stock_category: InventoryStockCategory;
    receipt_date: string;
    received_by: string;
    dispatch_number: string;
    notes?: string;
  }): Promise<InventoryMaterial> {
    const { data, error } = await this.supabase.rpc(
      "create_inventory_material",
      {
        p_material_name: payload.material_name,
        p_material_code: payload.material_code || null,
        p_unit: payload.unit,
        p_initial_quantity: payload.initial_quantity,
        p_stock_category: payload.stock_category,
        p_receipt_date: payload.receipt_date,
        p_received_by: payload.received_by,
        p_dispatch_number: payload.dispatch_number,
        p_notes: payload.notes || null,
      }
    );
    if (error) throw error;
    return data as InventoryMaterial;
  }

  async recordMovement(payload: {
    material_id: string;
    movement_type: InventoryMovementType;
    quantity: number;
    source_location?: InventoryLocation;
    project_name?: string;
    project_code?: string;
    team_personnel_ids?: string[];
    description?: string;
  }): Promise<InventoryMaterial> {
    const { data, error } = await this.supabase.rpc(
      "record_inventory_movement",
      {
        p_material_id: payload.material_id,
        p_movement_type: payload.movement_type,
        p_quantity: payload.quantity,
        p_source_location: payload.source_location || "center",
        p_project_name: payload.project_name || null,
        p_project_code: payload.project_code || null,
        p_team_personnel_ids: payload.team_personnel_ids || [],
        p_description: payload.description || null,
      }
    );
    if (error) throw error;
    return data as InventoryMaterial;
  }

  async listCatalogs(): Promise<InventoryCatalog[]> {
    const { data, error } = await this.supabase.from("inventory_catalog").select("*").order("material_name");
    if (error) throw error;
    return (data ?? []) as InventoryCatalog[];
  }

  async listShipments(limit = 100): Promise<InventoryShipment[]> {
    const { data, error } = await this.supabase
      .from("inventory_shipments")
      .select("*, items:inventory_shipment_items(*, material:inventory_materials(material_name, material_code, unit))")
      .order("shipment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as InventoryShipment[];
  }

  async listReceipts(limit = 100): Promise<InventoryReceipt[]> {
    const { data, error } = await this.supabase.from("inventory_receipts")
      .select("*, items:inventory_receipt_items(*, material:inventory_materials(material_name,material_code,unit,stock_category,material_type,size))")
      .order("receipt_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []) as InventoryReceipt[];
  }

  async listRequests(): Promise<InventoryRequest[]> {
    const { data, error } = await this.supabase
      .from("inventory_requests")
      .select("*, items:inventory_request_items(*, catalog:inventory_catalog(*)), receipt_items:inventory_request_receipt_items(*, catalog:inventory_catalog(*))")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as InventoryRequest[];
  }

  async createRequest(payload: {
    request_date: string;
    requested_by: string;
    notes?: string;
    items: Array<{
      catalog_id?: string;
      quantity: number;
      new_catalog?: {
        material_name: string;
        stock_category: InventoryStockCategory;
        material_type?: string;
        size?: string;
        unit: InventoryUnit;
        has_id: boolean;
        notes?: string;
      };
    }>;
  }): Promise<void> {
    const { error } = await this.supabase.rpc("create_inventory_request", {
      p_request_date: payload.request_date,
      p_requested_by: payload.requested_by,
      p_notes: payload.notes || null,
      p_items: payload.items,
    });
    if (error) throw error;
  }

  async approveRequest(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("approve_inventory_request", { p_request_id: id });
    if (error) throw error;
  }

  async submitRequestReceipt(payload: {
    request_id: string;
    receipt_date: string;
    received_by: string;
    dispatch_number: string;
    notes?: string;
    items: Array<{ catalog_id: string; quantity: number; material_code?: string }>;
  }): Promise<void> {
    const { error } = await this.supabase.rpc("submit_inventory_request_receipt", {
      p_request_id: payload.request_id,
      p_receipt_date: payload.receipt_date,
      p_received_by: payload.received_by,
      p_dispatch_number: payload.dispatch_number,
      p_notes: payload.notes || null,
      p_items: payload.items,
    });
    if (error) throw error;
  }

  async finalizeRequestReceipt(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("approve_inventory_request_receipt", { p_request_id: id });
    if (error) throw error;
  }

  async createCatalogMaterial(payload: { material_name: string; stock_category: InventoryStockCategory; material_type?: string; size?: string; unit: InventoryUnit; has_id: boolean; notes?: string }): Promise<void> {
    const { error } = await this.supabase.rpc("create_inventory_catalog_material", {
      p_material_name: payload.material_name,
      p_stock_category: payload.stock_category, p_material_type: payload.material_type || null,
      p_size: payload.size || null, p_unit: payload.unit, p_has_id: payload.has_id, p_notes: payload.notes || null,
    });
    if (error) throw error;
  }

  async createReceipt(payload: { receipt_date: string; received_by: string; dispatch_number: string; notes?: string; items: { catalog_id: string; material_code?: string; quantity: number }[] }): Promise<void> {
    const { error } = await this.supabase.rpc("create_inventory_receipt", {
      p_receipt_date: payload.receipt_date, p_received_by: payload.received_by,
      p_dispatch_number: payload.dispatch_number, p_notes: payload.notes || null, p_items: payload.items,
    });
    if (error) throw error;
  }

  async deleteMaterial(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("delete_inventory_material_with_history", { p_material_id: id });
    if (error) throw error;
  }

  async deleteCatalog(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("delete_inventory_catalog_with_history", { p_catalog_id: id });
    if (error) throw error;
  }

  async transferToBiga(payload: {
    material_id: string;
    quantity: number;
    description?: string;
  }): Promise<InventoryMaterial> {
    const { data, error } = await this.supabase.rpc("transfer_inventory_to_biga", {
      p_material_id: payload.material_id,
      p_quantity: payload.quantity,
      p_description: payload.description || null,
    });
    if (error) throw error;
    return data as InventoryMaterial;
  }

  async createBigaShipment(payload: {
    shipment_date: string;
    delivered_by: string;
    received_by: string;
    vehicle_plate: string;
    notes?: string;
    items: { material_id: string; quantity: number }[];
  }): Promise<void> {
    const { error } = await this.supabase.rpc("create_biga_inventory_shipment", {
      p_shipment_date: payload.shipment_date,
      p_delivered_by: payload.delivered_by,
      p_received_by: payload.received_by,
      p_vehicle_plate: payload.vehicle_plate,
      p_notes: payload.notes || null,
      p_items: payload.items,
    });
    if (error) throw error;
  }

  async deleteShipment(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("delete_biga_inventory_shipment", { p_shipment_id: id });
    if (error) throw error;
  }

  async deleteMovement(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("delete_inventory_movement", {
      p_movement_id: id,
    });
    if (error) throw error;
  }

  async listCustodyBalances(): Promise<InventoryCustodyBalance[]> {
    const { data, error } = await this.supabase
      .from("inventory_custody_balances")
      .select(
        "*, material:inventory_materials!inner(material_name, material_code, unit, material_category)"
      )
      .eq("material.material_category", "equipment")
      .order("holder_name");
    if (error) throw error;
    return (data ?? []) as InventoryCustodyBalance[];
  }

  async listPersonnelCustodyBalances(
    personnelId: string
  ): Promise<InventoryCustodyBalance[]> {
    const { data, error } = await this.supabase
      .from("inventory_custody_balances")
      .select(
        "*, material:inventory_materials(material_name, material_code, unit)"
      )
      .eq("holder_type", "personnel")
      .eq("holder_id", personnelId)
      .gt("quantity", 0)
      .order("holder_name");
    if (error) throw error;
    return (data ?? []) as InventoryCustodyBalance[];
  }

  async listVehicleCustodyBalances(vehicleId?: string): Promise<InventoryCustodyBalance[]> {
    let query = this.supabase
      .from("inventory_custody_balances")
      .select("*, material:inventory_materials!inner(material_name, material_code, unit, material_category)")
      .eq("holder_type", "vehicle")
      .eq("material.material_category", "equipment")
      .gt("quantity", 0);
    if (vehicleId) query = query.eq("holder_id", vehicleId);
    const { data, error } = await query.order("holder_name");
    if (error) throw error;
    return (data ?? []) as InventoryCustodyBalance[];
  }

  async listCustodyMovements(limit = 100): Promise<
    InventoryCustodyMovement[]
  > {
    const { data, error } = await this.supabase
      .from("inventory_custody_movements")
      .select(
        "*, material:inventory_materials!inner(material_name, material_code, unit, material_category)"
      )
      .eq("material.material_category", "equipment")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as InventoryCustodyMovement[];
  }

  async listTeamOptions(): Promise<CustodyTeamOption[]> {
    const { data, error } = await this.supabase
      .from("daily_work_plan_teams")
      .select(
        "id, team_type, project_name, chief_name, plan:daily_work_plans(plan_date)"
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []).map((team) => {
      const plan = team.plan as unknown as { plan_date?: string } | null;
      return {
        id: team.id as string,
        label: `${team.team_type} · ${team.project_name} · ${team.chief_name}${
          plan?.plan_date ? ` · ${plan.plan_date}` : ""
        }`,
      };
    });
  }

  async transferCustody(payload: {
    material_id: string;
    quantity: number;
    from_type: CustodyLocationType;
    from_id: string | null;
    to_type: CustodyLocationType;
    to_id: string | null;
    notes?: string;
  }): Promise<void> {
    const { error } = await this.supabase.rpc("transfer_inventory_custody", {
      p_material_id: payload.material_id,
      p_quantity: payload.quantity,
      p_from_type: payload.from_type,
      p_from_id: payload.from_id,
      p_to_type: payload.to_type,
      p_to_id: payload.to_id,
      p_notes: payload.notes || null,
    });
    if (error) throw error;
  }
}
