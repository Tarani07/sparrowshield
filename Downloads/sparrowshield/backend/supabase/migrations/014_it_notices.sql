-- IT Notices table: allows admins to push messages to all device tray menus
create table if not exists public.it_notices (
  id          uuid primary key default gen_random_uuid(),
  message     text not null,
  sender      text not null default 'IT Admin',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz default null
);

-- Auto-deactivate expired notices
create or replace function public.expire_it_notices()
returns trigger language plpgsql as $$
begin
  update public.it_notices
  set active = false
  where expires_at is not null and expires_at < now();
  return null;
end;
$$;

create or replace trigger trg_expire_notices
  after insert or update on public.it_notices
  execute function public.expire_it_notices();

-- Allow anon to read active notices
alter table public.it_notices enable row level security;

create policy "anon can read active notices"
  on public.it_notices for select
  to anon
  using (active = true);

-- Sample notice (optional — remove before production)
-- insert into public.it_notices (message, sender) values
--   ('VPN required after 5 PM today. Connect to GlobalProtect before leaving office.', 'IT Admin');
