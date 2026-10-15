-- Табель хаускипинга.
-- Смена = «со скольки до скольки» (график свободный) + квартиры, которые убрал сотрудник,
-- + премия супервайзера за хорошо убранную квартиру (EGP). Неделя (пн–вс) закрывается.
-- Миграция безопасна для повторного запуска (if not exists / or replace / drop ... if exists).
-- Записи пишутся только через RPC (security definer); супервайзеры читают через sv_hk_* views.

create table if not exists hk_shifts (
  id         bigserial primary key,
  staff_id   int  not null references staff(id),
  work_date  date not null,                 -- день начала смены (смена может кончаться после полуночи)
  start_time time not null,
  end_time   time not null,
  note       text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, work_date),
  check (start_time <> end_time)
);
create index if not exists hk_shifts_date on hk_shifts(work_date);

create table if not exists hk_shift_apartments (
  shift_id     bigint not null references hk_shifts(id) on delete cascade,
  apartment_id int    not null references apartments(id),
  bonus        numeric(12,2) not null default 0 check (bonus >= 0),   -- премия за эту квартиру, EGP
  primary key (shift_id, apartment_id)
);
create index if not exists hk_shift_apartments_apt on hk_shift_apartments(apartment_id);

create table if not exists hk_week_closures (
  week_start date primary key check (extract(isodow from week_start) = 1),   -- понедельник
  closed_at  timestamptz not null default now(),
  closed_by  uuid default auth.uid()
);

-- ── вспомогательные функции ─────────────────────────────────────────────
create or replace function hk_hours(p_start time, p_end time) returns numeric
language sql immutable as $$
  select round(mod(extract(epoch from (p_end - p_start))::numeric + 86400, 86400) / 3600, 2)
$$;
create or replace function _hk_today() returns date
language sql stable as $$
  select (now() at time zone 'Africa/Cairo')::date
$$;
create or replace function _hk_monday(p date) returns date
language sql immutable as $$
  select date_trunc('week', p::timestamp)::date
$$;
create or replace function _hk_lock_week(p date) returns void
language sql as $$
  select pg_advisory_xact_lock(8101, ((p - date '2000-01-03') / 7)::int)
$$;

-- ── views для чтения (как sv_staff / sv_apartments) ─────────────────────
create or replace view sv_hk_staff as
select id, full_name, active
from staff
where role = 'housekeeper' and is_active_user();

create or replace view sv_hk_apartments as
select a.id, a.code, b.name as building, a.type, a.status
from apartments a join buildings b on b.id = a.building_id
where is_active_user();

create or replace view sv_hk_shifts as
select s.id, s.staff_id, s.work_date, s.start_time, s.end_time, s.note,
       hk_hours(s.start_time, s.end_time) as hours
from hk_shifts s
where is_active_user();

-- share: если квартиру в один день убирают двое-трое, доля делится поровну (как в Excel)
create or replace view sv_hk_lines as
select s.id as shift_id, s.staff_id, s.work_date, sa.apartment_id, sa.bonus,
       (1.0 / count(*) over (partition by s.work_date, sa.apartment_id)) as share,
       (count(*) over (partition by s.work_date, sa.apartment_id))::int as cleaners
from hk_shifts s join hk_shift_apartments sa on sa.shift_id = s.id
where is_active_user();

create or replace view sv_hk_closures as
select week_start, closed_at
from hk_week_closures
where is_active_user();

-- ── RPC ─────────────────────────────────────────────────────────────────
create or replace function hk_save_shift(p_staff_id int, p_date date, p_start time, p_end time,
                              p_apartments jsonb default '[]', p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id bigint; v_item jsonb; v_apt int; v_bonus numeric; v_seen int[] := '{}';
begin
  if not (is_admin() or is_supervisor()) then raise exception 'hk_forbidden' using errcode = '42501'; end if;
  if p_staff_id is null or p_date is null or p_start is null or p_end is null then raise exception 'hk_bad_input'; end if;
  if p_start = p_end then raise exception 'hk_bad_time'; end if;
  if p_date > _hk_today() then raise exception 'hk_future'; end if;
  if p_apartments is null then p_apartments := '[]'::jsonb; end if;
  if jsonb_typeof(p_apartments) <> 'array' then raise exception 'hk_bad_input'; end if;

  perform _hk_lock_week(p_date);
  if exists (select 1 from hk_week_closures where week_start = _hk_monday(p_date)) then
    raise exception 'hk_week_closed';
  end if;
  -- неактивного сотрудника можно только поправить, если смена уже была
  if not exists (
    select 1 from staff s
    where s.id = p_staff_id and s.role = 'housekeeper'
      and (s.active or exists (select 1 from hk_shifts h where h.staff_id = s.id and h.work_date = p_date))
  ) then raise exception 'hk_bad_staff'; end if;

  insert into hk_shifts(staff_id, work_date, start_time, end_time, note)
  values (p_staff_id, p_date, p_start, p_end, nullif(trim(p_note), ''))
  on conflict (staff_id, work_date) do update
    set start_time = excluded.start_time, end_time = excluded.end_time,
        note = excluded.note, updated_at = now()
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_apartments) loop
    v_apt   := (v_item->>'apartment_id')::int;
    v_bonus := coalesce(nullif(v_item->>'bonus', '')::numeric, 0);
    if v_apt is null or v_apt = any (v_seen) then raise exception 'hk_bad_input'; end if;
    if v_bonus < 0 or v_bonus > 1000000 then raise exception 'hk_bad_bonus'; end if;
    if not exists (select 1 from apartments where id = v_apt) then raise exception 'hk_bad_apartment'; end if;
    v_seen := v_seen || v_apt;
    insert into hk_shift_apartments(shift_id, apartment_id, bonus)
    values (v_id, v_apt, v_bonus)
    on conflict (shift_id, apartment_id) do update set bonus = excluded.bonus;
  end loop;
  delete from hk_shift_apartments where shift_id = v_id and not (apartment_id = any (v_seen));

  return jsonb_build_object('shift_id', v_id);
end $$;

create or replace function hk_delete_shift(p_staff_id int, p_date date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not (is_admin() or is_supervisor()) then raise exception 'hk_forbidden' using errcode = '42501'; end if;
  if p_staff_id is null or p_date is null then raise exception 'hk_bad_input'; end if;
  perform _hk_lock_week(p_date);
  if exists (select 1 from hk_week_closures where week_start = _hk_monday(p_date)) then
    raise exception 'hk_week_closed';
  end if;
  delete from hk_shifts where staff_id = p_staff_id and work_date = p_date;
  get diagnostics v_n = row_count;
  return jsonb_build_object('deleted', v_n > 0);
end $$;

create or replace function hk_close_week(p_week date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_week date;
begin
  if not (is_admin() or is_supervisor()) then raise exception 'hk_forbidden' using errcode = '42501'; end if;
  if p_week is null then raise exception 'hk_bad_input'; end if;
  v_week := _hk_monday(p_week);
  if v_week > _hk_today() then raise exception 'hk_week_future'; end if;
  perform _hk_lock_week(v_week);
  insert into hk_week_closures(week_start) values (v_week) on conflict do nothing;
  return jsonb_build_object('week_start', v_week, 'closed', true);
end $$;

create or replace function hk_reopen_week(p_week date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_week date;
begin
  if not is_admin() then raise exception 'hk_admin_only' using errcode = '42501'; end if;
  if p_week is null then raise exception 'hk_bad_input'; end if;
  v_week := _hk_monday(p_week);
  perform _hk_lock_week(v_week);
  delete from hk_week_closures where week_start = v_week;
  return jsonb_build_object('week_start', v_week, 'closed', false);
end $$;

-- ── доступ ──────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['hk_shifts','hk_shift_apartments','hk_week_closures']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists admin_all on %I', t);
    execute format('create policy admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
    execute format('revoke all on %I from anon', t);
    execute format('revoke insert, update, delete on %I from authenticated', t);
    execute format('drop trigger if exists audit_%1$s on %1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on %1$I
                    for each row execute function audit_row()', t);
  end loop;
end $$;
revoke all on sequence hk_shifts_id_seq from anon;

revoke all on sv_hk_staff, sv_hk_apartments, sv_hk_shifts, sv_hk_lines, sv_hk_closures from anon;
grant select on sv_hk_staff, sv_hk_apartments, sv_hk_shifts, sv_hk_lines, sv_hk_closures to authenticated;

revoke all on function hk_hours(time, time), _hk_today(), _hk_monday(date), _hk_lock_week(date),
                       hk_save_shift(int, date, time, time, jsonb, text), hk_delete_shift(int, date),
                       hk_close_week(date), hk_reopen_week(date)
  from public, anon;
grant execute on function hk_save_shift(int, date, time, time, jsonb, text),
                          hk_delete_shift(int, date), hk_close_week(date), hk_reopen_week(date)
  to authenticated;
