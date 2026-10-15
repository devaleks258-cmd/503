-- Перенос данных из прежней версии табеля (hk_work_days / hk_work_lines / hk_bonuses / hk_norm_hours / hk_week_report),
-- созданной вне репозитория, в модель миграции 006. Старые таблицы НЕ удаляются.
--   • смены (open_time/close_time → start_time/end_time) и квартиры смен копируются; премия по квартире = 0
--   • недельные премии (hk_bonuses) и нормы часов (hk_norm_hours) в новую модель не переносятся:
--     премия теперь привязана к квартире в смене, нормы часов не используются; данные остаются в старых таблицах
--   • старые таблицы закрываются от anon и включается RLS (политик для authenticated не добавляется:
--     приложение их больше не читает)
-- Миграция безопасна для повторного запуска и для базы без старых таблиц.
do $$
declare
  v_shifts int := 0; v_lines int := 0; v_skipped int := 0; v_bonus int := 0; t text; f record;
begin
  if to_regclass('public.hk_work_days') is not null then
    execute $q$
      insert into hk_shifts(staff_id, work_date, start_time, end_time, note)
      select d.staff_id, d.work_date, d.open_time, d.close_time, nullif(trim(d.note), '')
      from hk_work_days d
      join staff s on s.id = d.staff_id
      where d.open_time is not null and d.close_time is not null and d.open_time <> d.close_time
      on conflict (staff_id, work_date) do nothing
    $q$;
    get diagnostics v_shifts = row_count;
    execute $q$
      select count(*) from hk_work_days d
      where d.open_time is null or d.close_time is null or d.open_time = d.close_time
    $q$ into v_skipped;

    if to_regclass('public.hk_work_lines') is not null then
      execute $q$
        insert into hk_shift_apartments(shift_id, apartment_id, bonus)
        select distinct on (h.id, l.apartment_id) h.id, l.apartment_id, 0
        from hk_work_lines l
        join hk_work_days d on d.id = l.work_day_id
        join hk_shifts h on h.staff_id = d.staff_id and h.work_date = d.work_date
        join apartments a on a.id = l.apartment_id
        where l.apartment_id is not null
        on conflict (shift_id, apartment_id) do nothing
      $q$;
      get diagnostics v_lines = row_count;
    end if;
  end if;

  if to_regclass('public.hk_bonuses') is not null then
    execute 'select count(*) from hk_bonuses where amount > 0' into v_bonus;
  end if;

  foreach t in array array['hk_work_days', 'hk_work_lines', 'hk_bonuses', 'hk_norm_hours']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table %I enable row level security', t);
      execute format('revoke all on %I from anon', t);
    end if;
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'hk_week_report'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
  end loop;

  raise notice 'hk legacy import: смен скопировано %, строк квартир %, смен пропущено (нет времени/начало=конец) %, недельных премий >0 НЕ перенесено (остались в hk_bonuses) %',
    v_shifts, v_lines, v_skipped, v_bonus;
end $$;
