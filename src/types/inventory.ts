export type InventoryUnit = "piece" | "meter" | "kilogram";
export type InventoryMovementType = "in" | "out";
export type InventoryMovementAction = "in" | "usage" | "transfer";
export type InventoryMaterialCategory = "stock" | "equipment";

/** Firmanın tanımladığı malzeme kategorisi */
export type InventoryCategory = {
  id: string;
  name: string;
  sort_order: number;
};

/** Depo / şube; is_main = ana depo (stoğu inventory_materials.stock_quantity) */
export type InventoryLocation = {
  id: string;
  name: string;
  is_main: boolean;
  sort_order: number;
};

export type InventoryLocationStock = {
  location_id: string;
  quantity: number;
};

export type InventoryMaterial = {
  id: string;
  material_code: string | null;
  material_name: string;
  unit: InventoryUnit;
  /** Ana depodaki stok */
  stock_quantity: number;
  /** Ana depo dışındaki depoların stoğu */
  location_stocks?: InventoryLocationStock[];
  material_category: InventoryMaterialCategory;
  category_id: string | null;
  material_type: string | null;
  size: string | null;
  catalog_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryCatalog = {
  id: string;
  material_name: string;
  category_id: string | null;
  material_type: string | null;
  size: string | null;
  unit: InventoryUnit;
  has_id: boolean;
  notes: string | null;
  created_at: string;
};

export type InventoryMovement = {
  id: string;
  material_id: string;
  movement_type: InventoryMovementType;
  quantity: number;
  usage_location: string | null;
  action_type: InventoryMovementAction;
  source_location_id: string | null;
  target_location_id: string | null;
  project_name: string | null;
  project_code: string | null;
  team_personnel_ids: string[];
  team_personnel_names: string[];
  shipment_id: string | null;
  receipt_date: string | null;
  received_by: string | null;
  dispatch_number: string | null;
  description: string | null;
  balance_after: number;
  created_at: string;
  material?: {
    material_name: string;
    material_code: string | null;
    unit: InventoryUnit;
  } | null;
};

export type InventoryShipmentItem = {
  id: string;
  shipment_id: string;
  material_id: string;
  quantity: number;
  material?: Pick<InventoryMaterial, "material_name" | "material_code" | "unit"> | null;
};

export type InventoryShipment = {
  id: string;
  shipment_date: string;
  delivered_by: string;
  received_by: string;
  vehicle_id: string | null;
  vehicle_plate: string | null;
  from_location_id: string;
  to_location_id: string;
  notes: string | null;
  created_at: string;
  items: InventoryShipmentItem[];
};

export type InventoryReceiptItem = {
  id: string;
  receipt_id: string;
  material_id: string;
  quantity: number;
  material?: Pick<InventoryMaterial, "material_name" | "material_code" | "unit" | "category_id" | "material_type" | "size"> | null;
};

export type InventoryReceipt = {
  id: string;
  receipt_date: string;
  received_by: string;
  dispatch_number: string;
  notes: string | null;
  created_at: string;
  items: InventoryReceiptItem[];
};

export type InventoryRequestStatus = "requested" | "approved" | "receipt_review" | "received";

export type InventoryRequestItem = {
  id: string;
  request_id: string;
  catalog_id: string;
  quantity: number;
  catalog?: InventoryCatalog | null;
};

export type InventoryRequest = {
  id: string;
  request_date: string;
  requested_by: string;
  status: InventoryRequestStatus;
  notes: string | null;
  approved_at: string | null;
  received_at: string | null;
  receipt_id: string | null;
  pending_receipt_date: string | null;
  pending_received_by: string | null;
  pending_dispatch_number: string | null;
  pending_receipt_notes: string | null;
  created_at: string;
  items: InventoryRequestItem[];
  receipt_items: Array<{
    id: string;
    request_id: string;
    catalog_id: string;
    quantity: number;
    material_code: string | null;
    catalog?: InventoryCatalog | null;
  }>;
};

export type CustodyLocationType = "warehouse" | "personnel" | "team" | "vehicle";

export type InventoryCustodyBalance = {
  id: string;
  material_id: string;
  holder_type: Exclude<CustodyLocationType, "warehouse">;
  holder_id: string;
  holder_name: string;
  quantity: number;
  updated_at: string;
  material?: Pick<
    InventoryMaterial,
    "material_name" | "material_code" | "unit"
  > | null;
};

export type InventoryCustodyMovement = {
  id: string;
  material_id: string;
  from_type: CustodyLocationType;
  from_id: string | null;
  from_name: string;
  to_type: CustodyLocationType;
  to_id: string | null;
  to_name: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  material?: Pick<
    InventoryMaterial,
    "material_name" | "material_code" | "unit"
  > | null;
};

export type CustodyTeamOption = {
  id: string;
  label: string;
};
