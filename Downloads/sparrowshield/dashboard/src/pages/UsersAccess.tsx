import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, UserPlus, Shield, Eye, Trash2, KeyRound } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { timeAgo } from "../lib/utils";
import TopBar from "../components/layout/TopBar";
import { Page, PageHeader, Panel, StatTile, DataTable, Badge, Button, Drawer, inputClass, type Column } from "../components/ui";

type ConsoleUser = { user_id: string; email: string; role: "admin" | "viewer"; created_at: string; last_seen_at: string | null };

async function callAdmin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    // Surface the function's own message (e.g. "You cannot remove the last admin").
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? (await ctx.json().catch(() => null))?.error : null;
    throw new Error(msg ?? error.message);
  }
  return data;
}

export default function UsersAccess() {
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", role: "viewer" as "admin" | "viewer" });
  const [removeTarget, setRemoveTarget] = useState<ConsoleUser | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery<ConsoleUser[]>({
    queryKey: ["console-users"],
    queryFn: async () => (await supabase.from("console_users").select("user_id, email, role, created_at, last_seen_at").order("email")).data as ConsoleUser[] ?? [],
  });

  const doInvite = useMutation({
    mutationFn: () => callAdmin({ action: "invite", email: invite.email, role: invite.role }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["console-users"] }); setInviteOpen(false); setInvite({ email: "", role: "viewer" }); },
  });
  const setRole = useMutation({
    mutationFn: (v: { user_id: string; role: "admin" | "viewer" }) => callAdmin({ action: "set_role", ...v }),
    onMutate: () => setRowError(null),
    onError: e => setRowError((e as Error).message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["console-users"] }),
  });
  const remove = useMutation({
    mutationFn: (user_id: string) => callAdmin({ action: "remove", user_id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["console-users"] }); setRemoveTarget(null); },
  });

  const admins = users.filter(u => u.role === "admin").length;

  const columns: Column<ConsoleUser>[] = [
    { key: "email", header: "User", render: u => (
      <div className="flex items-center gap-2.5">
        <span className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold text-white shrink-0"
          style={{ background: u.role === "admin" ? "linear-gradient(135deg,#3b6cf6,#1d4ed8)" : "linear-gradient(135deg,#64748b,#475569)" }}>
          {u.email.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="font-medium truncate" style={{ color: "var(--c-strong)" }}>{u.email}{u.user_id === user?.id && <span style={{ color: "var(--c-muted)" }}> (you)</span>}</p>
          <p className="text-[11.5px]" style={{ color: "var(--c-muted)" }}>Added {timeAgo(u.created_at)}</p>
        </div>
      </div>) },
    { key: "role", header: "Role", render: u => isAdmin ? (
      <select value={u.role} disabled={setRole.isPending}
        onChange={e => setRole.mutate({ user_id: u.user_id, role: e.target.value as "admin" | "viewer" })}
        className={inputClass} aria-label={`Role for ${u.email}`}>
        <option value="admin">Admin — full control</option>
        <option value="viewer">Read-only</option>
      </select>
    ) : <Badge tone={u.role === "admin" ? "accent" : "neutral"}>{u.role === "admin" ? "Admin" : "Read-only"}</Badge> },
    { key: "last_seen_at", header: "Last active", value: u => u.last_seen_at ?? "", render: u => u.last_seen_at ? timeAgo(u.last_seen_at) : <span style={{ color: "var(--c-muted)" }}>Never signed in</span> },
    { key: "actions", header: "", sortable: false, align: "right", width: "60px", render: u => isAdmin && u.user_id !== user?.id ? (
      <button onClick={() => setRemoveTarget(u)} title="Remove access" className="p-1.5 rounded hover:bg-[var(--c-card2)]" style={{ color: "var(--c-muted)" }}>
        <Trash2 className="w-4 h-4" />
      </button>) : null },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Users & Roles" />
      <Page className="max-w-6xl">
        <PageHeader
          title="Users & Roles"
          crumbs={[{ label: "Administration" }, { label: "Users & Roles" }]}
          description="Who can sign in to this console and what they can do. Admins can change policies and run actions on devices; read-only users can view everything but change nothing."
          actions={<Button variant="primary" icon={UserPlus} onClick={() => setInviteOpen(true)}>Invite user</Button>}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <StatTile label="Users" icon={Users} value={users.length} />
          <StatTile label="Admins" icon={Shield} tone="accent" value={admins} />
          <StatTile label="Read-only" icon={Eye} value={users.length - admins} />
        </div>

        {rowError && (
          <p className="mb-3 text-[12.5px] rounded-md border px-3 py-2" style={{ color: "var(--sev-critical)", borderColor: "var(--c-border2)", background: "var(--c-card2)" }}>
            {rowError}
          </p>
        )}

        <DataTable rows={users} columns={columns} rowKey={u => u.user_id} loading={isLoading}
          searchPlaceholder="Search users…" exportName="console-users" initialSort={{ key: "email", dir: "asc" }}
          filters={[{ key: "role", label: "Role", options: [{ value: "admin", label: "Admin" }, { value: "viewer", label: "Read-only" }], get: u => u.role }]} />

        <Panel title="Sign-in methods" className="mt-4">
          <div className="flex items-start gap-3 text-[13px]" style={{ color: "var(--c-text)" }}>
            <KeyRound className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--c-accent)" }} />
            <div className="space-y-1.5">
              <p><b style={{ color: "var(--c-strong)" }}>Email code</b> is always on — invited users type their work email and receive a sign-in code.</p>
              <p><b style={{ color: "var(--c-strong)" }}>Google / Microsoft / Okta (SSO)</b> appear on the sign-in page once enabled in
                Supabase → Authentication → Providers. Only invited users get in — anyone else sees “No access”.</p>
            </div>
          </div>
        </Panel>
      </Page>

      <Drawer open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite user" width={440}
        footer={<>
          <Button onClick={() => setInviteOpen(false)}>Cancel</Button>
          <Button variant="primary" icon={UserPlus} disabled={!invite.email.trim() || doInvite.isPending} onClick={() => doInvite.mutate()}>
            {doInvite.isPending ? "Inviting…" : "Invite"}
          </Button>
        </>}>
        <div className="space-y-4">
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Work email</span>
            <input autoFocus type="email" className={`${inputClass} w-full`} value={invite.email}
              onChange={e => setInvite(i => ({ ...i, email: e.target.value }))} placeholder="name@surveysparrow.com" />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Role</legend>
            {([["viewer", "Read-only", "Can view all pages, alerts and reports. Cannot change anything."],
               ["admin", "Admin", "Full control: policies, device actions, users and settings."]] as const).map(([v, label, desc]) => (
              <label key={v} className="flex items-start gap-2.5 rounded-md border p-3 cursor-pointer"
                style={{ borderColor: invite.role === v ? "var(--c-accent)" : "var(--c-border2)", background: invite.role === v ? "var(--c-accent-bg)" : "var(--c-card2)" }}>
                <input type="radio" name="role" className="mt-0.5" checked={invite.role === v} onChange={() => setInvite(i => ({ ...i, role: v }))} />
                <span>
                  <span className="block text-[13px] font-medium" style={{ color: "var(--c-strong)" }}>{label}</span>
                  <span className="block text-[12px]" style={{ color: "var(--c-muted)" }}>{desc}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="text-[12px]" style={{ color: "var(--c-muted)" }}>
            They sign in at sparrowshield.vercel.app with this email and a one-time code. No password needed.
          </p>
          {doInvite.isError && <p className="text-[12.5px]" style={{ color: "var(--sev-critical)" }}>{(doInvite.error as Error).message}</p>}
        </div>
      </Drawer>

      <Drawer open={!!removeTarget} onClose={() => setRemoveTarget(null)} title="Remove access" subtitle={removeTarget?.email} width={420}
        footer={<>
          <Button onClick={() => setRemoveTarget(null)}>Cancel</Button>
          <Button variant="danger" icon={Trash2} disabled={remove.isPending} onClick={() => removeTarget && remove.mutate(removeTarget.user_id)}>
            {remove.isPending ? "Removing…" : "Remove access"}
          </Button>
        </>}>
        <p className="text-[13px]" style={{ color: "var(--c-text)" }}>
          {removeTarget?.email} will be signed out and can no longer sign in to SparrowShield. You can invite them again later.
        </p>
        {remove.isError && <p className="mt-3 text-[12.5px]" style={{ color: "var(--sev-critical)" }}>{(remove.error as Error).message}</p>}
      </Drawer>
    </div>
  );
}
