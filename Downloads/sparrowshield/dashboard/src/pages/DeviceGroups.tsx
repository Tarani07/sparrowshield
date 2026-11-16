import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { Users, Plus, Trash2, Monitor, X } from "lucide-react";
import TopBar from "../components/layout/TopBar";

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
  group_id: string | null;
}

interface GroupMember {
  device_id: string;
  group_id: string;
}

export default function DeviceGroups() {
  const qc = useQueryClient();
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [addingGroup, setAddingGroup]     = useState(false);
  const [newName, setNewName]             = useState("");
  const [newDesc, setNewDesc]             = useState("");
  const [newColor, setNewColor]           = useState("#6366f1");
  const [assigningDevices, setAssigningDevices] = useState(false);

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ["device-groups"],
    queryFn: async () => {
      const { data } = await supabase
        .from("device_groups")
        .select("id, name, description, color, created_at")
        .order("name");
      return data ?? [];
    },
  });

  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["all-devices-groups"],
    queryFn: async () => {
      const { data } = await supabase
        .from("devices")
        .select("id, hostname, os_type, status, group_id")
        .order("hostname");
      return data ?? [];
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

  const createGroup = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("device_groups").insert({
        name: newName.trim(), description: newDesc.trim() || null, color: newColor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["device-groups"] });
      setNewName(""); setNewDesc(""); setAddingGroup(false);
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("device_groups").delete().eq("id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["device-groups"] });
      if (selectedGroup === deleteGroup.variables) setSelectedGroup(null);
    },
  });

  const addToGroup = useMutation({
    mutationFn: async ({ deviceId, groupId }: { deviceId: string; groupId: string }) => {
      await supabase.from("device_group_members").upsert({ device_id: deviceId, group_id: groupId });
      await supabase.from("devices").update({ group_id: groupId }).eq("id", deviceId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-members"] });
      qc.invalidateQueries({ queryKey: ["all-devices-groups"] });
    },
  });

  const removeFromGroup = useMutation({
    mutationFn: async ({ deviceId, groupId }: { deviceId: string; groupId: string }) => {
      await supabase.from("device_group_members")
        .delete().eq("device_id", deviceId).eq("group_id", groupId);
      await supabase.from("devices").update({ group_id: null }).eq("id", deviceId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-members"] });
      qc.invalidateQueries({ queryKey: ["all-devices-groups"] });
    },
  });

  const selectedGroupObj = groups.find(g => g.id === selectedGroup);
  const groupDeviceIds   = new Set(members.filter(m => m.group_id === selectedGroup).map(m => m.device_id));
  const groupDevices     = devices.filter(d => groupDeviceIds.has(d.id));
  const ungroupedDevices = devices.filter(d => !groupDeviceIds.has(d.id));

  const getMemberCount = (groupId: string) =>
    members.filter(m => m.group_id === groupId).length;

  const COLOR_PRESETS = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#64748b"];

  return (
    <div style={{ background: "var(--c-bg)", minHeight: "100vh" }}>
      <TopBar title="Device Groups" />
      <div className="p-6">
        <div className="flex gap-6">

          {/* Left: Groups List */}
          <div className="w-72 flex-shrink-0 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm" style={{ color: "var(--c-strong)" }}>
                Teams ({groups.length})
              </h2>
              <button onClick={() => setAddingGroup(true)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                style={{ background: "#6366f1", color: "white" }}>
                <Plus className="w-3 h-3" /> New
              </button>
            </div>

            {addingGroup && (
              <div className="rounded-xl p-3 border space-y-2" style={{ background: "var(--c-surface)", borderColor: "#6366f1" }}>
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Group name"
                  className="w-full px-2 py-1.5 rounded text-sm border"
                  style={{ background: "var(--c-bg)", borderColor: "var(--c-border)", color: "var(--c-fg)" }} />
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full px-2 py-1.5 rounded text-sm border"
                  style={{ background: "var(--c-bg)", borderColor: "var(--c-border)", color: "var(--c-fg)" }} />
                <div>
                  <p className="text-xs mb-1" style={{ color: "var(--c-muted)" }}>Color</p>
                  <div className="flex gap-1 flex-wrap">
                    {COLOR_PRESETS.map(c => (
                      <button key={c} onClick={() => setNewColor(c)}
                        className="w-5 h-5 rounded-full border-2"
                        style={{ background: c, borderColor: newColor === c ? "white" : "transparent" }} />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => createGroup.mutate()} disabled={!newName.trim()}
                    className="px-3 py-1 rounded text-xs text-white"
                    style={{ background: "#6366f1", opacity: !newName.trim() ? 0.5 : 1 }}>
                    Create
                  </button>
                  <button onClick={() => setAddingGroup(false)} className="text-xs" style={{ color: "var(--c-muted)" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {groups.map(group => (
              <button key={group.id}
                onClick={() => setSelectedGroup(group.id)}
                className="w-full text-left rounded-xl p-3 border transition-all"
                style={{
                  background:  selectedGroup === group.id ? "var(--c-surface)" : "transparent",
                  borderColor: selectedGroup === group.id ? group.color : "var(--c-border)",
                  borderWidth: selectedGroup === group.id ? "2px" : "1px",
                }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: group.color }} />
                    <span className="text-sm font-medium" style={{ color: "var(--c-strong)" }}>{group.name}</span>
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{ background: `${group.color}22`, color: group.color }}>
                    {getMemberCount(group.id)}
                  </span>
                </div>
                {group.description && (
                  <p className="text-xs mt-1 ml-5" style={{ color: "var(--c-muted)" }}>{group.description}</p>
                )}
              </button>
            ))}

            {groups.length === 0 && !addingGroup && (
              <p className="text-xs text-center py-4" style={{ color: "var(--c-muted)" }}>
                No groups yet. Create one to organize devices by team.
              </p>
            )}
          </div>

          {/* Right: Group Detail */}
          <div className="flex-1">
            {!selectedGroup ? (
              <div className="flex items-center justify-center h-64 rounded-xl border border-dashed"
                style={{ borderColor: "var(--c-border)" }}>
                <div className="text-center">
                  <Users className="w-10 h-10 mx-auto mb-2" style={{ color: "var(--c-muted)" }} />
                  <p className="text-sm" style={{ color: "var(--c-muted)" }}>Select a team to manage its devices</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Group Header */}
                <div className="flex items-center justify-between p-4 rounded-xl border"
                  style={{ background: "var(--c-surface)", borderColor: selectedGroupObj?.color }}>
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full" style={{ background: selectedGroupObj?.color }} />
                    <div>
                      <h2 className="font-semibold" style={{ color: "var(--c-strong)" }}>{selectedGroupObj?.name}</h2>
                      {selectedGroupObj?.description && (
                        <p className="text-xs" style={{ color: "var(--c-muted)" }}>{selectedGroupObj.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setAssigningDevices(!assigningDevices)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-white"
                      style={{ background: selectedGroupObj?.color }}>
                      <Plus className="w-3.5 h-3.5" /> Assign Devices
                    </button>
                    <button onClick={() => deleteGroup.mutate(selectedGroup)}
                      className="p-1.5 rounded-lg" style={{ color: "#ef4444" }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Assign devices panel */}
                {assigningDevices && ungroupedDevices.length > 0 && (
                  <div className="rounded-xl p-4 border space-y-2" style={{ background: "var(--c-surface)", borderColor: "var(--c-border)" }}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold" style={{ color: "var(--c-strong)" }}>
                        Unassigned Devices — click to add to {selectedGroupObj?.name}
                      </p>
                      <button onClick={() => setAssigningDevices(false)}>
                        <X className="w-4 h-4" style={{ color: "var(--c-muted)" }} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {ungroupedDevices.map(d => (
                        <button key={d.id}
                          onClick={() => addToGroup.mutate({ deviceId: d.id, groupId: selectedGroup })}
                          className="flex items-center gap-2 p-2 rounded-lg border text-left hover:border-current transition-all"
                          style={{ borderColor: "var(--c-border)", color: "var(--c-fg)" }}>
                          <Monitor className="w-3.5 h-3.5" style={{ color: "var(--c-muted)" }} />
                          <span className="text-xs truncate">{d.hostname}</span>
                          <span className="text-xs ml-auto" style={{ color: "var(--c-muted)" }}>{d.os_type}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Group members */}
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--c-border)" }}>
                  <div className="px-4 py-3 border-b flex items-center justify-between"
                    style={{ background: "var(--c-surface)", borderColor: "var(--c-border)" }}>
                    <p className="text-sm font-semibold" style={{ color: "var(--c-strong)" }}>
                      Devices in {selectedGroupObj?.name} ({groupDevices.length})
                    </p>
                  </div>
                  {groupDevices.length === 0 ? (
                    <div className="p-8 text-center text-sm" style={{ color: "var(--c-muted)" }}>
                      No devices in this group. Click "Assign Devices" to add some.
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead style={{ background: "var(--c-surface)" }}>
                        <tr>
                          {["Hostname", "OS", "Status", ""].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "var(--c-muted)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {groupDevices.map(d => (
                          <tr key={d.id} style={{ borderTop: "1px solid var(--c-border)" }}>
                            <td className="px-4 py-3 font-medium" style={{ color: "var(--c-strong)" }}>{d.hostname}</td>
                            <td className="px-4 py-3 text-xs capitalize" style={{ color: "var(--c-muted)" }}>{d.os_type}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full text-xs"
                                style={{
                                  background: d.status === "online" ? "#dcfce7" : "#fee2e2",
                                  color:      d.status === "online" ? "#16a34a" : "#ef4444",
                                }}>
                                {d.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => removeFromGroup.mutate({ deviceId: d.id, groupId: selectedGroup })}
                                className="p-1 rounded text-xs" style={{ color: "#ef4444" }}>
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
