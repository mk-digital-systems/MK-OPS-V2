"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Personnel, PersonnelInsert } from "@/types/work-plan";
import type { Vehicle, VehicleInput } from "@/types/vehicle";
import { dropHeaderRow, parseDateCell, parseNumberCell } from "@/lib/bulk-import";
import { createClient } from "@/lib/supabase/client";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";
import { BranchSelectField, useBranches } from "@/components/layout/branch-provider";
import { BulkImportDialog, type BulkRow } from "@/components/bulk/bulk-import-dialog";

async function currentUserId() {
  const { data } = await createClient().auth.getUser();
  return data.user?.id ?? null;
}

/** Personel: Ad Soyad* · Görev · Telefon · TC Kimlik No · İşe Giriş · Aylık Maaş */
export function PersonnelImportDialog({
  existing,
  approvalNote,
  onClose,
  onImported,
}: {
  existing: Personnel[];
  /** Şube şefi / muhasebe ekliyorsa: kayıtlar onaya düşer */
  approvalNote?: boolean;
  onClose: () => void;
  onImported: (created: Personnel[]) => void;
}) {
  const { defaultBranchId } = useBranches();
  const [branchId, setBranchId] = useState(defaultBranchId ?? "");
  const existingTc = new Set(existing.map((person) => person.tc_identity_number).filter(Boolean));

  function toRows(raw: string[][]): BulkRow<PersonnelInsert>[] {
    const seenTc = new Set<string>();
    return dropHeaderRow(raw, /ad\s*soyad|isim/i).map((cells) => {
      const [name = "", title = "", phone = "", tcRaw = "", start = "", salaryRaw = ""] = cells;
      const tc = tcRaw.replace(/\s/g, "");
      const startDate = parseDateCell(start);
      const salary = parseNumberCell(salaryRaw);
      let error: string | undefined;
      if (name.trim().length < 2) error = "Ad soyad en az 2 karakter";
      else if (tc && !/^\d{11}$/.test(tc)) error = "TC kimlik no 11 haneli olmalı";
      else if (tc && existingTc.has(tc)) error = "Bu TC ile personel zaten kayıtlı";
      else if (tc && seenTc.has(tc)) error = "Aynı TC listede iki kez var";
      else if (startDate === undefined) error = "İşe giriş tarihi okunamadı (gg.aa.yyyy)";
      else if (salary === undefined || (salary ?? 0) < 0) error = "Aylık maaş okunamadı";
      if (tc) seenTc.add(tc);
      return {
        cells,
        error,
        value: error
          ? undefined
          : {
              full_name: name.trim(),
              job_title: title.trim() || null,
              phone: phone.trim() || null,
              tc_identity_number: tc || null,
              employment_start_date: startDate ?? null,
              monthly_salary: salary ?? 0,
              branch_id: branchId || null,
            },
      };
    });
  }

  return (
    <BulkImportDialog
      title="Excel'den toplu personel ekle"
      columns={["Ad Soyad *", "Görev", "Telefon", "TC Kimlik No", "İşe Giriş", "Aylık Maaş"]}
      example={"Ali Veli\tUsta\t0555 111 22 33\t12345678901\t01.10.2026\t30.000\nAyşe Kaya\tKalfa"}
      note={approvalNote ? <p className="text-sm text-amber-700">Eklediğiniz personel, firma yöneticisi veya Merkez şantiye şefi onaylayınca kullanıma açılır.</p> : null}
      toRows={toRows}
      onImport={async (rows) => {
        const userId = await currentUserId();
        const created = await new PersonnelRepository(createClient()).createMany(
          rows.map((row) => ({ ...row, branch_id: branchId || null, created_by: userId, updated_by: userId }))
        );
        toast.success(`${created.length} personel eklendi`);
        onImported(created);
      }}
      onClose={onClose}
    >
      <BranchSelectField value={branchId} onChange={setBranchId} />
    </BulkImportDialog>
  );
}

/** Araç: Plaka* · Marka* · Model* · KM · Muayene Tarihi · Sigorta Tarihi */
export function VehicleImportDialog({
  existing,
  approvalNote,
  onClose,
  onImported,
}: {
  existing: Vehicle[];
  approvalNote?: boolean;
  onClose: () => void;
  onImported: (created: Vehicle[]) => void;
}) {
  const { defaultBranchId } = useBranches();
  const [branchId, setBranchId] = useState(defaultBranchId ?? "");
  const normalizePlate = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleUpperCase("tr-TR");
  const existingPlates = new Set(existing.map((vehicle) => normalizePlate(vehicle.plate)));

  function toRows(raw: string[][]): BulkRow<VehicleInput>[] {
    const seen = new Set<string>();
    return dropHeaderRow(raw, /plaka/i).map((cells) => {
      const [plateRaw = "", brand = "", model = "", kmRaw = "", inspection = "", insurance = ""] = cells;
      const plate = normalizePlate(plateRaw);
      const km = parseNumberCell(kmRaw);
      const inspectionDate = parseDateCell(inspection);
      const insuranceDate = parseDateCell(insurance);
      let error: string | undefined;
      if (plate.replace(/\s/g, "").length < 5) error = "Plaka en az 5 karakter";
      else if (existingPlates.has(plate)) error = "Bu plaka zaten kayıtlı";
      else if (seen.has(plate)) error = "Aynı plaka listede iki kez var";
      else if (brand.trim().length < 2) error = "Marka en az 2 karakter";
      else if (!model.trim()) error = "Model zorunlu";
      else if (km === undefined || (km ?? 0) < 0 || !Number.isInteger(km ?? 0)) error = "KM tam sayı olmalı";
      else if (inspectionDate === undefined) error = "Muayene tarihi okunamadı (gg.aa.yyyy)";
      else if (insuranceDate === undefined) error = "Sigorta tarihi okunamadı (gg.aa.yyyy)";
      seen.add(plate);
      return {
        cells,
        error,
        value: error
          ? undefined
          : {
              plate,
              brand: brand.trim(),
              model: model.trim(),
              current_km: km ?? 0,
              inspection_date: inspectionDate ?? null,
              insurance_date: insuranceDate ?? null,
            },
      };
    });
  }

  return (
    <BulkImportDialog
      title="Excel'den toplu araç ekle"
      columns={["Plaka *", "Marka *", "Model *", "KM", "Muayene Tarihi", "Sigorta Tarihi"]}
      example={"34 ABC 123\tFord\tTransit\t125000\t15.03.2027\t01.12.2026\n06 XYZ 45\tFiat\tDoblo"}
      note={approvalNote ? <p className="text-sm text-amber-700">Eklediğiniz araçlar, firma yöneticisi veya Merkez şantiye şefi onaylayınca kullanıma açılır.</p> : null}
      toRows={toRows}
      onImport={async (rows) => {
        const userId = await currentUserId();
        const created = await new VehicleRepository(createClient()).createMany(
          rows.map((row) => ({ ...row, branch_id: branchId || null, created_by: userId, updated_by: userId }))
        );
        toast.success(`${created.length} araç eklendi`);
        onImported(created);
      }}
      onClose={onClose}
    >
      <BranchSelectField value={branchId} onChange={setBranchId} />
    </BulkImportDialog>
  );
}
