import {
  Fingerprint, ScanFace, PersonStanding, Move3d, Compass, Laptop, MapPin, Sun, Camera, Mic,
  Wifi, Bluetooth, Keyboard, BatteryMedium, Thermometer, CircuitBoard, type LucideIcon,
} from "lucide-react";

export type SensorStatus = "ok" | "warning" | "error" | "not_present" | "unknown";

export type SensorRow = {
  device_id: string;
  sensor: string;
  category: string;
  name: string;
  status: SensorStatus;
  detail: string | null;
  value: Record<string, unknown>;
  first_seen: string;
  last_ok_at: string | null;
  changed_at: string;
  updated_at: string;
};

// Same order as the Mac vs Windows sensor comparison.
export const CATEGORIES: { key: string; label: string }[] = [
  { key: "biometrics", label: "Biometrics" },
  { key: "presence",   label: "Presence detection" },
  { key: "motion",     label: "Motion & tilt" },
  { key: "lid",        label: "Lid / hinge" },
  { key: "location",   label: "Cellular / location" },
  { key: "display",    label: "Display light" },
  { key: "camera",     label: "Camera" },
  { key: "audio",      label: "Microphone" },
  { key: "wireless",   label: "Wireless" },
  { key: "input",      label: "Keyboard & trackpad" },
  { key: "power",      label: "Battery" },
  { key: "thermal",    label: "Thermal" },
];
export const categoryLabel = (k: string) => CATEGORIES.find(c => c.key === k)?.label ?? k;
export const categoryRank = (k: string) => { const i = CATEGORIES.findIndex(c => c.key === k); return i < 0 ? 99 : i; };

const ICONS: Record<string, LucideIcon> = {
  touch_id: Fingerprint, fingerprint: Fingerprint, face_ir: ScanFace, presence: PersonStanding,
  accelerometer: Move3d, gyroscope: Move3d, compass: Compass, lid_angle: Laptop, location: MapPin,
  ambient_light: Sun, camera: Camera, microphone: Mic, wifi: Wifi, bluetooth: Bluetooth,
  keyboard_trackpad: Keyboard, battery: BatteryMedium, thermal: Thermometer,
};
export const sensorIcon = (k: string): LucideIcon => ICONS[k] ?? CircuitBoard;

export const STATUS_META: Record<SensorStatus, { label: string; tone: "ok" | "medium" | "critical" | "neutral"; rank: number }> = {
  error:       { label: "Failure",       tone: "critical", rank: 0 },
  warning:     { label: "Warning",       tone: "medium",   rank: 1 },
  unknown:     { label: "Unknown",       tone: "neutral",  rank: 2 },
  ok:          { label: "Working",       tone: "ok",       rank: 3 },
  not_present: { label: "Not available", tone: "neutral",  rank: 4 },
};
export const isIssue = (s: SensorStatus) => s === "error" || s === "warning";
