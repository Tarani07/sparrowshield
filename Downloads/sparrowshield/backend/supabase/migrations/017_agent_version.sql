-- Agent self-update: each Mac reports the version (manifest hash) it is running.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS agent_version text;
