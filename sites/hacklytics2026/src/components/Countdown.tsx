import { useEffect, useState } from "react";

const TARGET = new Date("2026-02-20T23:59:59");

function getTimeLeft() {
  const now = new Date().getTime();
  const distance = TARGET.getTime() - now;

  if (distance <= 0) return null;

  const days = Math.floor(distance / (1000 * 60 * 60 * 24));
  const hours = Math.floor((distance / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((distance / (1000 * 60)) % 60);
  const seconds = Math.floor((distance / 1000) % 60);

  return { days, hours, minutes, seconds };
}

function formatUnit(unit?: number) {
  return unit != null ? String(unit).padStart(2, "0") : "00";
}

export default function Countdown() {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft());

  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(interval);
  }, []);

  const units = [
    { label: "DAYS", value: timeLeft?.days },
    { label: "HOURS", value: timeLeft?.hours },
    { label: "MINUTES", value: timeLeft?.minutes },
    { label: "SECONDS", value: timeLeft?.seconds },
  ];

  return (
    <div className="flex gap-3 md:gap-4">
      {units.map((unit) => (
        <div key={unit.label} className="flex flex-col items-center bg-wonka-red rounded-2xl px-4 py-3 md:px-6 md:py-4 min-w-[60px] md:min-w-[90px] shadow-[0_4px_0_#991b1b] border-2 border-red-900">
          <span className="text-white text-3xl md:text-5xl font-bold">{formatUnit(unit.value)}</span>
          <span className="text-white text-xs md:text-sm tracking-wider mt-1">{unit.label}</span>
        </div>
      ))}
    </div>
  );
}
