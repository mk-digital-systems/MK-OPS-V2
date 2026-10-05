import type { InventoryStockCategory, InventoryUnit } from "@/types/inventory";

export const INVENTORY_STOCK_CATEGORIES: { value: InventoryStockCategory; label: string }[] = [
  { value: "fiber_cable", label: "Fiber Kablo Malzeme" },
  { value: "copper_network", label: "Bakır Şebeke Malzeme" },
  { value: "fiber_accessory", label: "Fiber Ek Malzeme" },
  { value: "underground", label: "Yeraltı Malzeme" },
];

export function getInventoryStockCategoryLabel(category: InventoryStockCategory | null) {
  return INVENTORY_STOCK_CATEGORIES.find((item) => item.value === category)?.label ?? "Kategorisiz";
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
