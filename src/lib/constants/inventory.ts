import type { InventoryCategory, InventoryLocation, InventoryMaterial, InventoryUnit } from "@/types/inventory";

export const UNCATEGORIZED_LABEL = "Kategorisiz";

export function getCategoryName(categories: InventoryCategory[], id: string | null | undefined) {
  return categories.find((item) => item.id === id)?.name ?? UNCATEGORIZED_LABEL;
}

/** Malzemenin verilen depodaki stoğu. */
export function stockAt(material: InventoryMaterial, location: InventoryLocation) {
  if (location.is_main) return Number(material.stock_quantity);
  return Number(material.location_stocks?.find((item) => item.location_id === location.id)?.quantity ?? 0);
}

/** Malzemenin bütün depolardaki toplam stoğu. */
export function totalStock(material: InventoryMaterial) {
  return Number(material.stock_quantity) + (material.location_stocks ?? []).reduce((sum, item) => sum + Number(item.quantity), 0);
}

export const INVENTORY_UNITS: {
  value: InventoryUnit;
  label: string;
  shortLabel: string;
}[] = [
  { value: "piece", label: "Adet", shortLabel: "adet" },
  { value: "meter", label: "Metre", shortLabel: "mt" },
  { value: "kilogram", label: "Kilo", shortLabel: "kg" },
];

export function getInventoryUnitLabel(unit: InventoryUnit) {
  return (
    INVENTORY_UNITS.find((item) => item.value === unit)?.shortLabel ?? unit
  );
}

export function formatInventoryQuantity(
  quantity: number,
  unit: InventoryUnit
) {
  const value = Number(quantity);
  return `${value.toLocaleString("tr-TR", {
    maximumFractionDigits: unit === "piece" ? 0 : 3,
  })} ${getInventoryUnitLabel(unit)}`;
}
