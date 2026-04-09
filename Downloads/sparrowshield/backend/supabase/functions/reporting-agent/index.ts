/**
 * HealSparrow Reporting Agent
 * Runs every 15 min (cron). For each online device, reads latest metrics +
 * processes, calls Claude to diagnose health, writes to device_health_reports.
 */

import { handleCors } from "../_shared/cors.ts";
import { success, failure } from "../_shared/response.ts";
import { getSupabase } from "../_shared/supabase.ts";
import { getAnthropic, CLAUDE_MODEL, MAX_TOKENS } from "../_shared/anthropic.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProcessRow {
  process_name: string;
  cpu_pct: number;
  ram_mb: number;
}

interface HealthReport {
  health_status: "healthy" | "warning" | "critical";
  health_score: number;
  summary: string;
  culprit_apps: Array<{
    app_name: string;
    ram_mb: number;
    cpu_pct: number;
    impact: "high" | "medium" | "low";
    recommendation: string;
  }>;
}

// ── Claude tool schema ─────────────────────────────────────────────────────────

const HEALTH_REPORT_TOOL = {
  name: "generate_health_report",
  description: "Generate a structured health report for a device based on its current metrics and running processes.",
  input_schema: {
    type: "object",
    properties: {
      health_status: {
        type: "string",
        enum: ["healthy", "warning", "critical"],
        description: "Overall health status of the device",
      },
      health_score: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "Health score: 90-100 healthy, 60-89 warning, 0-59 critical",
      },
      summary: {
        type: "string",
        description: "Plain English one-sentence summary for IT admin. E.g. 'System is critically slow — Chrome is consuming 3.8GB RAM.'",
      },
      culprit_apps: {
        type: "array",
        description: "Apps causing slowness, sorted by impact descending. Empty array if system is healthy.",
        items: {
          type: "object",
          properties: {
            app_name:       { type: "string" },
            ram_mb:         { type: "number" },
            cpu_pct:        { type: "number" },
            impact:         { type: "string", enum: ["high", "medium", "low"] },
            recommendation: { type: "string", description: "Short actionable tip for the user" },
          },
          required: ["app_name", "ram_mb", "cpu_pct", "impact", "recommendation"],
        },
      },
    },
    required: ["health_status", "health_score", "summary", "culprit_apps"],
  },
};

// ── Core analysis ──────────────────────────────────────────────────────────────

async function analyzeDevice(
  device: { hostname: string; os_type: string; os_version: string },
  metrics: Record<string, number | boolean | null>,
  processes: ProcessRow[],
  anthropic: ReturnType<typeof getAnthropic>,
): Promise<HealthReport | null> {
  const ramTotal = (metrics.ram_total_gb as number) || 0;
  const procLines = processes
    .slice(0, 15)
    .map((p) => `  - ${p.process_name}: ${Math.round(p.ram_mb)} MB RAM, ${p.cpu_pct.toFixed(1)}% CPU`)
    .join("\n");

  const userPrompt = `Device: ${device.hostname} (${device.os_type} ${device.os_version || ""})
RAM: ${metrics.ram_pct ?? "?"}% used${ramTotal ? ` (${ramTotal} GB total)` : ""}
CPU: ${metrics.cpu_pct ?? "?"}%
Disk: ${metrics.disk_pct ?? "?"}%
Battery: ${metrics.battery_health_pct != null ? `${metrics.battery_health_pct}%` : "N/A"}
Firewall: ${metrics.firewall_enabled ? "on" : "off"}
Encryption: ${(metrics.filevault_enabled || metrics.bitlocker_enabled) ? "on" : "off"}

Top processes by RAM:
${procLines || "  (no process data)"}

Analyze the system health and identify which applications are causing slowness or high resource usage.`;

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: `You are HealSparrow's diagnostic AI for IT fleet management. Analyze device metrics and running processes to determine system health and identify what is making the laptop slow.

Scoring guide:
- Start at 100
- Deduct 5 per 10% RAM over 70% (e.g. 91% RAM → -15)
- Deduct 5 per 10% CPU over 70%
- Deduct 10 if disk > 85%
- Deduct 5 if firewall is off
- Deduct 5 if encryption is off
- Deduct 3 per culprit app with > 1GB RAM

health_status:
- 90-100 → healthy
- 60-89 → warning
- 0-59 → critical

Only list apps as culprits if their RAM > 300MB or CPU > 15%. Skip system processes (kernel_task, System Idle, svchost) unless they are genuinely anomalous. Be concise and actionable.`,
      tools: [HEALTH_REPORT_TOOL],
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: userPrompt }],
    });

    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === "generate_health_report") {
        return block.input as HealthReport;
      }
    }
    return null;
  } catch (err) {
    console.error(`Claude call failed for ${device.hostname}:`, err);
    return null;
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") return failure("Method not allowed", 405);

  // Accept requests from cron (service_role key in Authorization header)
  // No device-level auth needed — this is a server-side agent.

  const supabase = getSupabase();
  const anthropic = getAnthropic();

  // Check if reporting agent is enabled
  const { data: cfgRow } = await supabase
    .from("config")
    .select("value")
    .eq("key", "reporting_agent_enabled")
    .single();

  if (cfgRow?.value === false) {
    return success({ skipped: true, reason: "reporting_agent_enabled is false" });
  }

  // Fetch all online devices (seen in last 30 min)
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: devices, error: devErr } = await supabase
    .from("devices")
    .select("id, hostname, os_type, os_version")
    .gte("last_seen", since);

  if (devErr) return failure(devErr.message, 500);
  if (!devices || devices.length === 0) {
    return success({ processed: 0, message: "No online devices found" });
  }

  const results: Array<{ device_id: string; hostname: string; status: string }> = [];

  for (const device of devices) {
    try {
      // Latest metrics row
      const { data: metricsRows } = await supabase
        .from("metrics")
        .select("cpu_pct, ram_pct, ram_total_gb, disk_pct, disk_total_gb, battery_health_pct, filevault_enabled, bitlocker_enabled, firewall_enabled")
        .eq("device_id", device.id)
        .order("timestamp", { ascending: false })
        .limit(1);

      const metrics = metricsRows?.[0] ?? {};

      // Top processes from last hour, sorted by RAM
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: processRows } = await supabase
        .from("processes")
        .select("process_name, cpu_pct, ram_mb")
        .eq("device_id", device.id)
        .gte("timestamp", oneHourAgo)
        .order("ram_mb", { ascending: false })
        .limit(20);

      // Deduplicate process names — keep highest RAM per name
      const seen = new Map<string, ProcessRow>();
      for (const p of (processRows ?? [])) {
        const existing = seen.get(p.process_name);
        if (!existing || p.ram_mb > existing.ram_mb) {
          seen.set(p.process_name, p);
        }
      }
      const processes = Array.from(seen.values())
        .sort((a, b) => b.ram_mb - a.ram_mb)
        .slice(0, 15);

      // Call Claude
      const report = await analyzeDevice(device, metrics, processes, anthropic);
      if (!report) {
        results.push({ device_id: device.id, hostname: device.hostname, status: "claude_failed" });
        continue;
      }

      // Write report
      const { error: insertErr } = await supabase.from("device_health_reports").insert({
        device_id:        device.id,
        health_status:    report.health_status,
        health_score:     report.health_score,
        summary:          report.summary,
        culprit_apps:     report.culprit_apps,
        metrics_snapshot: {
          cpu_pct:            metrics.cpu_pct ?? null,
          ram_pct:            metrics.ram_pct ?? null,
          disk_pct:           metrics.disk_pct ?? null,
          battery_health_pct: metrics.battery_health_pct ?? null,
        },
      });

      if (insertErr) {
        console.error(`Insert failed for ${device.hostname}:`, insertErr.message);
        results.push({ device_id: device.id, hostname: device.hostname, status: "insert_failed" });
      } else {
        results.push({ device_id: device.id, hostname: device.hostname, status: report.health_status });
      }
    } catch (err) {
      console.error(`Error processing device ${device.hostname}:`, err);
      results.push({ device_id: device.id, hostname: device.hostname, status: "error" });
    }
  }

  return success({ processed: results.length, results });
});
