import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AccountInfo, PermissionModule, UserProfile } from "@/types/auth";
import type { MyBranches } from "@/types/branch";

const WRITABLE_MODULES: PermissionModule[] = [
  "projects",
  "work_plans",
  "personnel",
  "attendance",
  "vehicles",
  "inventory",
  "custody",
  "productions",
  "hakedis",
];

const getRequestClient = cache(createClient);

/** React cache is scoped to the current Server Component request. */
export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await getRequestClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getCurrentUser = cache(async (): Promise<UserProfile | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await getRequestClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data as UserProfile | null;
});

export const getMyAccount = cache(async (): Promise<AccountInfo> => {
  const supabase = await getRequestClient();
  const { data, error } = await supabase.rpc("get_my_company");
  if (error) throw error;
  return (data as AccountInfo | null) ?? { is_super_admin: false, company: null };
});

export const getMyBranches = cache(async (): Promise<MyBranches> => {
  const supabase = await getRequestClient();
  const { data, error } = await supabase.rpc("get_my_branches");
  if (error) throw error;
  return (data as MyBranches | null) ?? {
    branches: [],
    total_count: 0,
    head_office: false,
    can_approve: false,
    assignments: null,
  };
});

export const canWrite = cache(async (module: PermissionModule): Promise<boolean> => {
  const supabase = await getRequestClient();
  const { data, error } = await supabase.rpc("has_module_write_permission", {
    p_module: module,
  });
  if (error) throw error;
  return data === true;
});

export const getWritableModules = cache(async (): Promise<PermissionModule[]> => {
  const results = await Promise.all(
    WRITABLE_MODULES.map(async (module) => ({ module, allowed: await canWrite(module) }))
  );
  return results.filter((item) => item.allowed).map((item) => item.module);
});
