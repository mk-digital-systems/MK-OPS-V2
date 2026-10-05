import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_CUSTOM_PROJECT_TYPES,
  FIXED_PROJECT_TYPES,
  type CustomProjectTypeKey,
} from "@/lib/constants/project";
import type { CustomProjectTypes } from "@/types/project";

export class SettingsRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getCustomProjectTypes(): Promise<CustomProjectTypes> {
    const { data, error } = await this.supabase
      .from("app_settings")
      .select("value")
      .eq("key", "custom_project_types")
      .maybeSingle();

    if (error) throw error;

    const value = (data?.value ?? {}) as Partial<CustomProjectTypes>;
    return {
      ...DEFAULT_CUSTOM_PROJECT_TYPES,
      ...value,
    };
  }

  async updateCustomProjectTypes(
    types: CustomProjectTypes,
    userId: string
  ): Promise<CustomProjectTypes> {
    const payload: CustomProjectTypes = {
      custom_1: types.custom_1.trim(),
      custom_2: types.custom_2.trim(),
      custom_3: types.custom_3.trim(),
      custom_4: types.custom_4.trim(),
    };

    const { data, error } = await this.supabase
      .from("app_settings")
      .upsert(
        {
          key: "custom_project_types",
          value: payload,
          updated_by: userId,
        },
        { onConflict: "key" }
      )
      .select("value")
      .single();

    if (error) throw error;
    return {
      ...DEFAULT_CUSTOM_PROJECT_TYPES,
      ...(data.value as CustomProjectTypes),
    };
  }

  async getAllProjectTypeOptions(): Promise<{ key: string; label: string }[]> {
    const order = new Map([
      ["HP_ODAKLI", 1],
      ["ERISIM_ZORUNLULUK", 2],
      ["KURUMSAL_TTVPN", 3],
      ["BGFD", 4],
    ]);
    return FIXED_PROJECT_TYPES
      .map((type) => ({ ...type }))
      .sort((left, right) => (order.get(left.key) ?? 99) - (order.get(right.key) ?? 99));
  }

  resolveTypeLabel(
    key: string,
    custom: CustomProjectTypes
  ): string {
    const fixed = FIXED_PROJECT_TYPES.find((t) => t.key === key);
    if (fixed) return fixed.label;
    if (key in custom) return custom[key as CustomProjectTypeKey];
    return key;
  }
}
