import { handleCors } from "../_shared/cors.ts";
import { success, failure } from "../_shared/response.ts";
import { getSupabase } from "../_shared/supabase.ts";

interface FieldCheck {
  field: string;
  expect: unknown;
  operator?: string;
  max_age_hours?: number;
}

interface Control {
  id: string;
  control_id: string;
  control_name: string;
  field_checks: FieldCheck[];
  severity: string;
}

function evaluateCheck(
  device: Record<string, unknown>,
  check: FieldCheck
): boolean {
  const value = device[check.field];

  if (check.expect === "not_null") {
    return value != null && value !== "" && value !== false;
  }

  if (check.expect === "recent" && check.max_age_hours) {
    if (!value) return false;
    const age =
      (Date.now() - new Date(value as string).getTime()) / (1000 * 60 * 60);
    return age <= check.max_age_hours;
  }

  const op = check.operator ?? "==";
  const expected = check.expect;

  switch (op) {
    case "==":
      return value === expected;
    case "!=":
      return value !== expected;
    case ">":
      return (value as number) > (expected as number);
    case ">=":
      return (value as number) >= (expected as number);
    case "<":
      return (value as number) < (expected as number);
    case "<=":
      return value != null && (value as number) <= (expected as number);
    default:
      return value === expected;
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const supabase = getSupabase();

  // Get enabled frameworks
  const { data: frameworks } = await supabase
    .from("compliance_frameworks")
    .select("id, name")
    .eq("enabled", true);

  if (!frameworks?.length) {
    return success({ evaluated: 0, message: "No enabled frameworks" });
  }

  // Get all devices
  const { data: devices } = await supabase
    .from("devices")
    .select("*");

  if (!devices?.length) {
    return success({ evaluated: 0, message: "No devices" });
  }

  let totalSnapshots = 0;

  for (const framework of frameworks) {
    // Get controls for this framework
    const { data: controls } = await supabase
      .from("compliance_controls")
      .select("*")
      .eq("framework_id", framework.id);

    if (!controls?.length) continue;

    for (const device of devices) {
      const details: { control_id: string; pass: boolean; field_values: Record<string, unknown> }[] = [];
      let passCount = 0;
      let failCount = 0;

      for (const control of controls as Control[]) {
        const fieldValues: Record<string, unknown> = {};
        let allPass = true;

        for (const check of control.field_checks) {
          fieldValues[check.field] = device[check.field];
          if (!evaluateCheck(device, check)) {
            allPass = false;
          }
        }

        if (allPass) {
          passCount++;
        } else {
          failCount++;
        }

        details.push({
          control_id: control.control_id,
          pass: allPass,
          field_values: fieldValues,
        });
      }

      const total = passCount + failCount;
      const score = total > 0 ? Math.round((passCount / total) * 100) : 0;

      // Delete old snapshot for this device+framework, then insert new
      await supabase
        .from("compliance_snapshots")
        .delete()
        .eq("device_id", device.id)
        .eq("framework", framework.name);

      await supabase.from("compliance_snapshots").insert({
        device_id: device.id,
        framework: framework.name,
        score,
        pass_count: passCount,
        fail_count: failCount,
        details,
      });

      totalSnapshots++;
    }
  }

  return success({
    evaluated: totalSnapshots,
    devices: devices.length,
    frameworks: frameworks.length,
  });
});
