-- Onay bekleyen irsaliyeyi geri çekme
--
--   İrsaliyeyi giren kişi (şube şantiye şefi veya muhasebe), onaylanmadan önce geri çekebilir (silinir).
--   Stok değişmediği için iz bırakmaz; düzeltmek için yeniden girilir. Firma yöneticisi / Merkez şefi
--   ret işlemiyle aynı sonucu alır.

create function public.withdraw_inventory_receipt(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  delete from public.inventory_receipts
  where id = p_receipt_id
    and company_id = public.current_company_id()
    and status = 'pending'
    and created_by = auth.uid()
    and public.can_access_branch(branch_id);
  if not found then
    raise exception 'Yalnızca kendi girdiğiniz, onay bekleyen irsaliyeyi geri çekebilirsiniz';
  end if;
end;
$$;

revoke all on function public.withdraw_inventory_receipt(uuid) from public, anon;
grant execute on function public.withdraw_inventory_receipt(uuid) to authenticated;
