"use client";

import { useState } from "react";
import { Scanner, useDevices, centerText, outline, boundingBox } from "@yudiel/react-qr-scanner";

export default function AdminScanPage() {
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [tracker, setTracker] = useState<string | undefined>("centerText");
  const [pause, setPause] = useState(false);

  const devices = useDevices();

  function getTracker() {
    switch (tracker) {
      case "outline": return outline;
      case "boundingBox": return boundingBox;
      case "centerText": return centerText;
      default: return undefined;
    }
  }

  const handleScan = async (data: string) => {
    setPause(true);
    try {
      const res = await fetch(`/api/verify?uuid=${encodeURIComponent(data)}`);
      const result = await res.json();
      if (result.success) alert(`Verified: ${result.userName}`);
      else alert(result.message);
    } catch (err) {
      console.error(err);
    } finally {
      setPause(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Admin QR Scanner</h1>

      <div className="mb-4">
        <select onChange={e => setDeviceId(e.target.value)}>
          <option value="">Select Device</option>
          {devices.map((d, i) => <option key={i} value={d.deviceId}>{d.label}</option>)}
        </select>

        <select onChange={e => setTracker(e.target.value)} className="ml-2">
          <option value="centerText">Center Text</option>
          <option value="outline">Outline</option>
          <option value="boundingBox">Bounding Box</option>
        </select>
      </div>

      <Scanner
        constraints={{ deviceId }}
        formats={["qr_code"]}
        onScan={codes => handleScan(codes[0].rawValue)}
        components={{ tracker: getTracker() }}
        scanDelay={2000}
        paused={pause}
        allowMultiple
      />
    </div>
  );
}
