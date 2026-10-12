"use client";

import { createContext, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BRANCH_COOKIE, type Branch } from "@/types/branch";

type BranchContextValue = {
  /** Kullanıcının erişebildiği şubeler. */
  branches: Branch[];
  /** Firmada birden fazla şube var mı (yoksa şube arayüzü gösterilmez). */
  multiBranch: boolean;
  /** Menüde seçili şube; null = erişilebilen bütün şubeler. */
  selectedId: string | null;
  /** Yeni kayıt için önerilen şube: seçili şube, yoksa Merkez ya da ilk şube. */
  defaultBranchId: string | null;
  branchName: (id: string | null | undefined) => string | null;
  select: (id: string | null) => void;
};

const BranchContext = createContext<BranchContextValue>({
  branches: [],
  multiBranch: false,
  selectedId: null,
  defaultBranchId: null,
  branchName: () => null,
  select: () => {},
});

export function BranchProvider({
  branches,
  totalCount,
  selectedId,
  children,
}: {
  branches: Branch[];
  totalCount: number;
  selectedId: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const value = useMemo<BranchContextValue>(() => {
    const byId = new Map(branches.map((branch) => [branch.id, branch.name]));
    return {
      branches,
      multiBranch: totalCount > 1,
      selectedId,
      defaultBranchId: selectedId ?? branches.find((branch) => branch.is_main)?.id ?? branches[0]?.id ?? null,
      branchName: (id) => (id ? byId.get(id) ?? null : null),
      select: (id) => {
        document.cookie = `${BRANCH_COOKIE}=${id ?? ""}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      },
    };
  }, [branches, totalCount, selectedId, router]);

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranches() {
  return useContext(BranchContext);
}

/** Formlarda şube seçimi: yalnızca kullanıcının birden fazla şubesi varsa görünür. */
export function BranchSelectField({
  id = "branch_id",
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { branches } = useBranches();
  if (branches.length < 2) return null;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        Şube
      </label>
      <select
        id={id}
        disabled={disabled}
        className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </div>
  );
}
