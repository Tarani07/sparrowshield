import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Trash2, Monitor, Apple, X, Laptop, UserPlus, AppWindow, Globe, ArrowRight, Search, ShieldCheck, Layers,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import TopBar from "../components/layout/TopBar";
import {
  Page, PageHeader, Panel, StatTile, DataTable, Badge, Button, Drawer, EmptyState, StatusBadge, inputClass,
  type Column,
} from "../components/ui";

interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
}

interface Device {
  id: string;
  hostname: string;
  os_type: string;
  status: string;
  last_seen: string | null;
  group_id: string | null;
}

interface GroupMember {
  device_id: string;
  group_id: string;
}

interface AppRule { id: string; app_name: string; list_type: "allowlist" | "blocklist"; group_id: string | null }
interface WebRule { id: string; domain: string; action: "block" | "allow"; enabled: boolean | null; group_id: string | null }

/** Row shown in the teams table. */
interface GroupRow extends Group {
  members: number;
  online: number;
  appRules: number;
  webRules: number;
}

type Notice = { tone: "ok" | "critical"; text: string } | null;

// Team colour is user data stored on the group (not a theme colour).
const COLOR_PRESETS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b"];

const isOnline = (d: Device) =>
  d.last_seen ? Date.now() - new Date(d.last_seen).getTime() < 15 * 60_000 : d.status === "online";

function NoticeLine({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  if (!notice) return null;
  const color = notice.tone === "ok" ? "var(--ok)" : "var(--sev-critical)";
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-[12.5px]"
      style={{ color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
      <span className="flex-1">{notice.text}</span>
      <button onClick={onClose} aria-label="Dismiss"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

export default function DeviceGroups() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [addingGroup, setAddingGroup]     = useState(false);
  const [newName, setNewName]             = useState("");
  const [newDesc, setNewDesc]             = useState("");
  const [newColor, setNewColor]           = useState(COLOR_PRESETS[0]);
  const [assignQuery, setAssignQuery]     = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice]               = useState<Notice>(null);
  const [pageNotice, setPageNotice]       = useState<Notice>(null);

  const { data: groups = [], isLoading } = useQuery<Group[]>({
    queryKey: ["device-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_groups")
        .select("id, name, description, color, created_at")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["all-devices-groups"],
    queryFn: async () => {
      const { data } = await supabase
        .from("devices")
        .select("id, hostname, os_type, status, last_seen, group_id")
        .order("hostname");
      return (data ?? []) as Device[];
    },
  });

  const { data: members = [] } = useQuery<GroupMember[]>({
    queryKey: ["group-members"],
    queryFn: async () => {
      const { data } = await supabase
        .from("device_group_members")
        .select("device_id, group_id");
      return data ?? [];
    },
  });

  // Team-scoped policies: software_lists.group_id / web_filter_rules.group_id → device_groups.id
  const { data: appRules = [] } = useQuery<AppRule[]>({
    queryKey: ["group-app-rules"],
    queryFn: async () => (await supabase.from("software_lists")
      .select("id, app_name, list_type, group_id").not("group_id", "is", null)).data as AppRule[] ?? [],
  });
  const { data: webRules = [] } = useQuery<WebRule[]>({
    queryKey: ["group-web-rules"],
    queryFn: async () => (await supabase.from("web_filter_rules")
      .select("id, domain, action, enabled, group_id").not("group_id", "is", null)).data as WebRule[] ?? [],
  });

  const invalidateMembership = () => {
    qc.invalidateQueries({ queryKey: ["group-members"] });
    qc.invalidateQueries({ queryKey: ["all-devices-groups"] });
  };

  const createGroup = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("device_groups").insert({
        name: newName.trim(), description: newDesc.trim() || null, color: newColor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["device-groups"] });
      setPageNotice({ tone: "ok", text: `Team "${newName.trim()}" created.` });
      setNewName(""); setNewDesc(""); setAddingGroup(false);
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("device_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      const name = groups.find(g => g.id === id)?.name ?? "Team";
      qc.invalidateQueries({ queryKey: ["device-groups"] });
      invalidateMembership();
      qc.invalidateQueries({ queryKey: ["group-app-rules"] });
      qc.invalidateQueries({ queryKey: ["group-web-rules"] });
      if (selectedGroup === id) setSelectedGroup(null);
      setConfirmDelete(false);
      setPageNotice({ tone: "ok", text: `${name} deleted. Its team-scoped rules were removed with it.` });
    },
    onError: e => setNotice({ tone: "critical", text: `Could not delete team: ${(e as Error).message}` }),
  });

  const addToGroup = useMutation({
    mutationFn: async ({ deviceId, groupId }: { deviceId: string; groupId: string }) => {
      const { error } = await supabase.from("device_group_members").upsert({ device_id: deviceId, group_id: groupId });
      if (error) throw error;
      const { error: e2 } = await supabase.from("devices").update({ group_id: groupId }).eq("id", deviceId);
      if (e2) throw e2;
    },
    onSuccess: (_d, v) => {
      invalidateMembership();
      setNotice({ tone: "ok", text: `${devices.find(d => d.id === v.deviceId)?.hostname ?? "Device"} added.` });
    },
    onError: e => setNotice({ tone: "critical", text: `Could not add device: ${(e as Error).message}` }),
  });

  const removeFromGroup = useMutation({
    mutationFn: async ({ deviceId, groupId }: { deviceId: string; groupId: string }) => {
      const { error } = await supabase.from("device_group_members")
        .delete().eq("device_id", deviceId).eq("group_id", groupId);
      if (error) throw error;
      // Only clear the device's primary team if it was this one.
      const { error: e2 } = await supabase.from("devices").update({ group_id: null }).eq("id", deviceId).eq("group_id", groupId);
      if (e2) throw e2;
    },
    onSuccess: (_d, v) => {
      invalidateMembership();
      setNotice({ tone: "ok", text: `${devices.find(d => d.id === v.deviceId)?.hostname ?? "Device"} removed.` });
    },
    onError: e => setNotice({ tone: "critical", text: `Could not remove device: ${(e as Error).message}` }),
  });

  const groupName = (id: string | null) => groups.find(g => g.id === id)?.name ?? null;

  const rows: GroupRow[] = useMemo(() => groups.map(g => {
    const ids = new Set(members.filter(m => m.group_id === g.id).map(m => m.device_id));
    const devs = devices.filter(d => ids.has(d.id));
    return {
      ...g,
      members: ids.size,
      online: devs.filter(isOnline).length,
      appRules: appRules.filter(r => r.group_id === g.id).length,
      webRules: webRules.filter(r => r.group_id === g.id).length,
    };
  }), [groups, members, devices, appRules, webRules]);

  const assignedIds = new Set(members.map(m => m.device_id));
  const unassigned = devices.filter(d => !assignedIds.has(d.id));

  const selectedGroupObj = groups.find(g => g.id === selectedGroup) ?? null;
  const groupDeviceIds   = new Set(members.filter(m => m.group_id === selectedGroup).map(m => m.device_id));
  const groupDevices     = devices.filter(d => groupDeviceIds.has(d.id));
  const candidates       = devices
    .filter(d => !groupDeviceIds.has(d.id))
    .filter(d => !assignQuery.trim() || d.hostname.toLowerCase().includes(assignQuery.trim().toLowerCase()));
  const groupAppRules = appRules.filter(r => r.group_id === selectedGroup);
  const groupWebRules = webRules.filter(r => r.group_id === selectedGroup);

  const openGroup = (id: string) => { setSelectedGroup(id); setNotice(null); setConfirmDelete(false); setAssignQuery(""); };

  const columns: Column<GroupRow>[] = [
    { key: "name", header: "Team", render: g => (
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />
        <div className="min-w-0">
          <p className="font-medium truncate" style={{ color: "var(--c-strong)" }}>{g.name}</p>
          {g.description && <p className="text-[11.5px] truncate max-w-[360px]" style={{ color: "var(--c-muted)" }}>{g.description}</p>}
        </div>
      </div>) },
    { key: "members", header: "Devices", align: "right", render: g => <span className="tabular-nums">{g.members}</span> },
    { key: "online", header: "Online", align: "right", hideBelow: "md",
      render: g => <span className="tabular-nums">{g.online}<span style={{ color: "var(--c-muted)" }}> / {g.members}</span></span> },
    { key: "appRules", header: "App rules", align: "right", hideBelow: "md",
      render: g => g.appRules ? <Badge tone="accent">{g.appRules}</Badge> : <span style={{ color: "var(--c-muted)" }}>—</span> },
    { key: "webRules", header: "Web rules", align: "right", hideBelow: "md",
      render: g => g.webRules ? <Badge tone="accent">{g.webRules}</Badge> : <span style={{ color: "var(--c-muted)" }}>—</span> },
    { key: "created_at", header: "Created", hideBelow: "lg", render: g => timeAgo(g.created_at) },
  ];

  const OsIcon = ({ d }: { d: Device }) => d.os_type === "windows"
    ? <Monitor className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--c-muted)" }} />
    : <Apple className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--c-muted)" }} />;

  const sectionTitle = (t: string, right?: React.ReactNode) => (
    <div className="flex items-center justify-between mb-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--c-muted)" }}>{t}</h4>
      {right}
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Device Groups" />
      <Page>
        <PageHeader
          title="Device Groups"
          icon={Users}
          crumbs={[{ label: "Endpoints" }, { label: "Device Groups" }]}
          description="Organise endpoints into teams. Application and web-filter rules can be scoped to a team so they apply only to its devices."
          actions={<Button variant="primary" icon={Plus} onClick={() => { createGroup.reset(); setAddingGroup(true); }}>New team</Button>}
        />

        {pageNotice && <div className="mb-3"><NoticeLine notice={pageNotice} onClose={() => setPageNotice(null)} /></div>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatTile label="Teams" icon={Layers} tone="accent" value={groups.length} />
          <StatTile label="Devices assigned" icon={Laptop} tone="ok" value={assignedIds.size}
            sub={`of ${devices.length} enrolled`} />
          <StatTile label="Unassigned" icon={Users} tone={unassigned.length ? "medium" : "ok"} value={unassigned.length}
            sub="Only fleet-wide rules apply" onClick={unassigned.length ? () => navigate("/devices") : undefined} />
          <StatTile label="Team-scoped rules" icon={ShieldCheck} tone="neutral" value={appRules.length + webRules.length}
            sub={`${appRules.length} app · ${webRules.length} web`} onClick={() => navigate("/app-filter")} />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={g => g.id}
          loading={isLoading}
          searchPlaceholder="Search teams…"
          searchText={g => [g.name, g.description].join(" ")}
          initialSort={{ key: "name", dir: "asc" }}
          onRowClick={g => openGroup(g.id)}
          selectedKey={selectedGroup}
          exportName="device-groups"
          empty={<EmptyState icon={Users} title="No teams yet" hint="Create a team to organise devices and scope policies."
            action={<Button variant="primary" icon={Plus} onClick={() => setAddingGroup(true)}>New team</Button>} />}
        />

        {unassigned.length > 0 && (
          <Panel title={`Unassigned devices (${unassigned.length})`} subtitle="Open a team to add these devices to it" className="mt-4">
            <div className="flex flex-wrap gap-1.5">
              {unassigned.slice(0, 40).map(d => (
                <Link key={d.id} to={`/device/${d.id}`}>
                  <Badge tone="neutral" className="hover:brightness-125"><OsIcon d={d} />{d.hostname}</Badge>
                </Link>
              ))}
              {unassigned.length > 40 && <span className="text-[12px]" style={{ color: "var(--c-muted)" }}>+{unassigned.length - 40} more</span>}
            </div>
          </Panel>
        )}
      </Page>

      {/* Team detail */}
      <Drawer
        open={!!selectedGroupObj}
        onClose={() => setSelectedGroup(null)}
        width={600}
        title={selectedGroupObj && <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ background: selectedGroupObj.color }} />{selectedGroupObj.name}
        </span>}
        subtitle={selectedGroupObj?.description ?? `${groupDevices.length} device${groupDevices.length === 1 ? "" : "s"}`}
        footer={selectedGroupObj && (confirmDelete ? <>
          <span className="mr-auto self-center text-[12px]" style={{ color: "var(--sev-critical)" }}>Delete team and its scoped rules?</span>
          <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" icon={Trash2} disabled={deleteGroup.isPending} onClick={() => deleteGroup.mutate(selectedGroupObj.id)}>
            {deleteGroup.isPending ? "Deleting…" : "Confirm delete"}
          </Button>
        </> : <>
          <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete team</Button>
          <Button onClick={() => setSelectedGroup(null)}>Close</Button>
        </>)}
      >
        {selectedGroupObj && (
          <div className="space-y-6">
            <NoticeLine notice={notice} onClose={() => setNotice(null)} />

            {/* Members */}
            <section>
              {sectionTitle(`Devices (${groupDevices.length})`)}
              {groupDevices.length === 0 ? (
                <p className="text-[12.5px] py-3" style={{ color: "var(--c-muted)" }}>No devices in this team yet — add some below.</p>
              ) : (
                <ul className="rounded-md border" style={{ borderColor: "var(--c-border)" }}>
                  {groupDevices.map(d => (
                    <li key={d.id} className="flex items-center gap-3 px-3 h-11 border-b last:border-b-0" style={{ borderColor: "var(--c-divider)" }}>
                      <OsIcon d={d} />
                      <Link to={`/device/${d.id}`} className="flex-1 min-w-0 truncate text-[13px] font-medium hover:underline" style={{ color: "var(--c-strong)" }}>{d.hostname}</Link>
                      <StatusBadge online={isOnline(d)} />
                      <Button size="sm" variant="ghost" icon={X} title="Remove from team"
                        disabled={removeFromGroup.isPending && removeFromGroup.variables?.deviceId === d.id}
                        onClick={() => removeFromGroup.mutate({ deviceId: d.id, groupId: selectedGroupObj.id })}>Remove</Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Add members */}
            <section>
              {sectionTitle("Add devices")}
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--c-muted)" }} />
                <input className={`${inputClass} w-full pl-8`} placeholder="Search devices…" value={assignQuery} onChange={e => setAssignQuery(e.target.value)} />
              </div>
              {candidates.length === 0 ? (
                <p className="text-[12.5px] py-2" style={{ color: "var(--c-muted)" }}>
                  {devices.length === groupDevices.length ? "Every device is already in this team." : "No devices match."}
                </p>
              ) : (
                <ul className="rounded-md border max-h-[240px] overflow-y-auto" style={{ borderColor: "var(--c-border)" }}>
                  {candidates.map(d => {
                    const current = groupName(d.group_id);
                    return (
                      <li key={d.id} className="flex items-center gap-3 px-3 h-10 border-b last:border-b-0" style={{ borderColor: "var(--c-divider)" }}>
                        <OsIcon d={d} />
                        <span className="flex-1 min-w-0 truncate text-[12.5px]" style={{ color: "var(--c-text)" }}>{d.hostname}</span>
                        {current && <Badge tone="neutral" className="hidden sm:inline-flex">in {current}</Badge>}
                        <Button size="sm" icon={UserPlus}
                          disabled={addToGroup.isPending && addToGroup.variables?.deviceId === d.id}
                          onClick={() => addToGroup.mutate({ deviceId: d.id, groupId: selectedGroupObj.id })}>Add</Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Policies */}
            <section>
              {sectionTitle("Policies applied to this team")}
              <p className="text-[12px] mb-3" style={{ color: "var(--c-muted)" }}>
                Devices in this team get every fleet-wide rule plus the team-scoped rules below.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-md border p-3" style={{ borderColor: "var(--c-border)", background: "var(--c-card2)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: "var(--c-strong)" }}>
                      <AppWindow className="w-4 h-4" style={{ color: "var(--c-accent)" }} /> Application rules
                    </span>
                    <Link to="/app-filter" className="text-[12px] font-medium flex items-center gap-1" style={{ color: "var(--c-accent)" }}>Manage <ArrowRight className="w-3 h-3" /></Link>
                  </div>
                  {groupAppRules.length === 0 ? (
                    <p className="text-[12px]" style={{ color: "var(--c-muted)" }}>No team-specific app rules.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {groupAppRules.slice(0, 8).map(r => (
                        <li key={r.id} className="flex items-center gap-2 text-[12.5px]">
                          <Badge tone={r.list_type === "blocklist" ? "critical" : "ok"}>{r.list_type === "blocklist" ? "Block" : "Allow"}</Badge>
                          <span className="truncate" style={{ color: "var(--c-text)" }}>{r.app_name}</span>
                        </li>
                      ))}
                      {groupAppRules.length > 8 && <li className="text-[11.5px]" style={{ color: "var(--c-muted)" }}>+{groupAppRules.length - 8} more</li>}
                    </ul>
                  )}
                </div>
                <div className="rounded-md border p-3" style={{ borderColor: "var(--c-border)", background: "var(--c-card2)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: "var(--c-strong)" }}>
                      <Globe className="w-4 h-4" style={{ color: "var(--c-accent)" }} /> Web filter rules
                    </span>
                    <Link to="/web-filter" className="text-[12px] font-medium flex items-center gap-1" style={{ color: "var(--c-accent)" }}>Manage <ArrowRight className="w-3 h-3" /></Link>
                  </div>
                  {groupWebRules.length === 0 ? (
                    <p className="text-[12px]" style={{ color: "var(--c-muted)" }}>No team-specific web rules.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {groupWebRules.slice(0, 8).map(r => (
                        <li key={r.id} className="flex items-center gap-2 text-[12.5px]">
                          <Badge tone={r.action === "block" ? "critical" : "ok"}>{r.action === "block" ? "Block" : "Allow"}</Badge>
                          <span className="truncate font-mono text-[12px]" style={{ color: r.enabled === false ? "var(--c-muted)" : "var(--c-text)" }}>{r.domain}</span>
                          {r.enabled === false && <span className="text-[11px]" style={{ color: "var(--c-muted)" }}>(disabled)</span>}
                        </li>
                      ))}
                      {groupWebRules.length > 8 && <li className="text-[11.5px]" style={{ color: "var(--c-muted)" }}>+{groupWebRules.length - 8} more</li>}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </Drawer>

      {/* Create team */}
      <Drawer open={addingGroup} onClose={() => setAddingGroup(false)} title="New team" width={440}
        footer={<>
          <Button onClick={() => setAddingGroup(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => createGroup.mutate()} disabled={!newName.trim() || createGroup.isPending}>
            {createGroup.isPending ? "Creating…" : "Create team"}
          </Button>
        </>}>
        <div className="space-y-4">
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Name</span>
            <input autoFocus className={`${inputClass} w-full`} value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Engineering" />
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Description (optional)</span>
            <input className={`${inputClass} w-full`} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Who is in this team" />
          </label>
          <div>
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Colour</span>
            <div className="flex gap-2 flex-wrap">
              {COLOR_PRESETS.map(c => (
                <button key={c} onClick={() => setNewColor(c)} aria-label={`Colour ${c}`}
                  className="w-6 h-6 rounded-full"
                  style={{ background: c, boxShadow: newColor === c ? "0 0 0 2px var(--c-card), 0 0 0 4px var(--c-strong)" : undefined }} />
              ))}
            </div>
          </div>
          {createGroup.isError && <p className="text-[12.5px]" style={{ color: "var(--sev-critical)" }}>Could not create team: {(createGroup.error as Error).message}</p>}
        </div>
      </Drawer>
    </div>
  );
}
