-- Agents (anon) could not insert alerts: no INSERT policy existed after 010 tightened RLS,
-- so every agent-side detection was silently rejected. Agents may create, not modify, alerts.
DO $$ BEGIN
  CREATE POLICY "anon_insert_alerts" ON alerts FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT INSERT ON alerts TO anon;

-- security_events rejected severity 'high', used by detection rules and the EDR engine.
ALTER TABLE security_events DROP CONSTRAINT IF EXISTS security_events_severity_check;
ALTER TABLE security_events ADD CONSTRAINT security_events_severity_check
  CHECK (severity IN ('info', 'warning', 'high', 'critical'));

-- Curated, maintained category lists sized to fit a hosts-file budget.
UPDATE web_categories SET blocklist_url = 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/tif.mini-onlydomains.txt',
  description = 'Malware, C2 and scam domains (hagezi threat intelligence)' WHERE name = 'malware';
UPDATE web_categories SET blocklist_url = 'https://phishing.army/download/phishing_army_blocklist.txt' WHERE name = 'phishing';
UPDATE web_categories SET blocklist_url = 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/nsfw-onlydomains.txt' WHERE name = 'adult';
UPDATE web_categories SET blocklist_url = 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/gambling.mini-onlydomains.txt' WHERE name = 'gambling';
UPDATE web_categories SET blocklist_url = 'https://raw.githubusercontent.com/olbat/ut1-blacklists/master/blacklists/games/domains',
  description = 'Online gaming sites (Poki, Roblox, Steam, Epic, ...)' WHERE name = 'gaming';
UPDATE web_categories SET blocklist_url = 'https://raw.githubusercontent.com/olbat/ut1-blacklists/master/blacklists/social_networks/domains' WHERE name = 'social';
