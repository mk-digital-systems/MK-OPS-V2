-- İmalatta "ekip adı" olarak yalnızca iş planında ekip şefi (ekip başı) yazılmış kişiler seçilir.
-- Kullanıcının görebildiği (şube yetkisine göre süzülmüş) planlardaki ekip şefleri döner.

create function public.get_team_chief_ids()
returns uuid[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(distinct t.chief_personnel_id), '{}')
  from public.daily_work_plan_teams t
  where t.chief_personnel_id is not null;
$$;

revoke all on function public.get_team_chief_ids() from public, anon;
grant execute on function public.get_team_chief_ids() to authenticated;
