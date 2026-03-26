import { MapPin, Globe, Wifi } from "lucide-react";
import type { Device } from "../../lib/types";

interface Props {
  device: Device;
}

export default function LocationCard({ device }: Props) {
  const hasLocation = device.city || device.country;
  const lat = device.latitude;
  const lon = device.longitude;

  // Generate a static map image URL (OpenStreetMap via Staticmap API)
  const mapUrl =
    lat && lon
      ? `https://staticmap.thismoment.com/staticmap?center=${lat},${lon}&zoom=12&size=600x200&markers=${lat},${lon},red-pushpin`
      : null;

  // Google Maps link
  const mapsLink =
    lat && lon
      ? `https://www.google.com/maps?q=${lat},${lon}`
      : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-4">
        <MapPin className="w-4 h-4 text-indigo-400" />
        Last Known Location
      </h2>

      {!hasLocation ? (
        <p className="text-xs text-slate-600 text-center py-4">
          Location data not available yet — agent sends this on next heartbeat
        </p>
      ) : (
        <div className="space-y-3">
          {/* Location info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">City</p>
              <p className="text-sm font-medium text-slate-200">
                {device.city || "—"}{device.region ? `, ${device.region}` : ""}
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Country</p>
              <p className="text-sm font-medium text-slate-200">
                {device.country || "—"}
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <div className="flex items-center gap-1.5 mb-1">
                <Globe className="w-3 h-3 text-slate-500" />
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Public IP</p>
              </div>
              <p className="text-xs font-mono text-slate-300">
                {device.public_ip || "—"}
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <div className="flex items-center gap-1.5 mb-1">
                <Wifi className="w-3 h-3 text-slate-500" />
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">ISP</p>
              </div>
              <p className="text-xs text-slate-300 truncate">
                {device.isp || "—"}
              </p>
            </div>
          </div>

          {/* Coordinates + link */}
          {lat && lon && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <p className="text-[10px] text-slate-600 font-mono">
                {lat.toFixed(4)}, {lon.toFixed(4)}
              </p>
              {mapsLink && (
                <a
                  href={mapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                >
                  <MapPin className="w-3 h-3" />
                  Open in Google Maps
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
