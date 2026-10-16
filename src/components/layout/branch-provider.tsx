"use client";

import { Fragment, createContext, useContext, useMemo } from "react";
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
  /** Tek şubeye ait işlemler (iş planı) için şube; tek şubeli kullanıcıda null. */
  effectiveBranchId: string | null;
  /** Firma yöneticisi veya Merkez şantiye şefi (bütün şubeler, personel/araç onayı). */
  headOffice: boolean;
  /** Şantiye şefi veya firma yöneticisi: kendi şubesinin bekleyen personel/araç/irsaliye kayıtlarını onaylar. */
  canApprove: boolean;
  branchName: (id: string | null | undefined) => string | null;
  select: (id: string | null) => void;
};

const BranchContext = createContext<BranchContextValue>({
  branches: [],
  multiBranch: false,
  selectedId: null,
  defaultBranchId: null,
  effectiveBranchId: null,
  headOffice: false,
  canApprove: false,
  branchName: () => null,
  select: () => {},
});

export function BranchProvider({
  branches,
  totalCount,
  headOffice,
  canApprove,
  selectedId,
  children,
}: {
  branches: Branch[];
  totalCount: number;
  headOffice: boolean;
  canApprove: boolean;
  selectedId: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const value = useMemo<BranchContextValue>(() => {
    const byId = new Map(branches.map((branch) => [branch.id, branch.name]));
    const defaultBranchId = selectedId ?? branches.find((branch) => branch.is_main)?.id ?? branches[0]?.id ?? null;
    return {
      branches,
      multiBranch: totalCount > 1,
      selectedId,
      defaultBranchId,
      effectiveBranchId: branches.length > 1 ? defaultBranchId : selectedId,
      headOffice,
      canApprove,
      branchName: (id) => (id ? byId.get(id) ?? null : null),
      select: (id) => {
        document.cookie = `${BRANCH_COOKIE}=${id ?? ""}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      },
    };
  }, [branches, totalCount, headOffice, canApprove, selectedId, router]);

  // Şube değişince sayfa içeriği yeniden kurulur: listeler ilk gelen veriyi state'te tuttuğundan,
  // anahtar olmadan seçim yenilemeden sonra da eski şubenin verisini göstermeye devam ederdi.
  return (
    <BranchContext.Provider value={value}>
      <Fragment key={selectedId ?? "all"}>{children}</Fragment>
    </BranchContext.Provider>
  );
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
