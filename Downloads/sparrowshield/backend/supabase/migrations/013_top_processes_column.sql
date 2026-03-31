-- Add top_processes column to devices table
alter table public.devices
  add column if not exists top_processes jsonb default null;
