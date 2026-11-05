-- Add MITRE ATT&CK columns to edr_events
alter table public.edr_events
  add column if not exists mitre_technique_id   text,
  add column if not exists mitre_technique_name text,
  add column if not exists mitre_tactic         text,
  add column if not exists mitre_tactic_id      text,
  add column if not exists mitre_url            text,
  add column if not exists mitre_techniques     jsonb;

create index if not exists idx_edr_mitre_technique
  on public.edr_events(mitre_technique_id)
  where mitre_technique_id is not null;

create index if not exists idx_edr_mitre_tactic
  on public.edr_events(mitre_tactic)
  where mitre_tactic is not null;
