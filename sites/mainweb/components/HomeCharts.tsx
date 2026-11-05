"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { useWindowWidth } from "@/lib/use-window-width";
import { ClassData, MajorData } from "@/assets/Data/demographics";

const Pie = dynamic(() => import("react-chartjs-2").then((mod) => mod.Pie), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-64 flex items-center justify-center text-gray-500 font-mono text-xs uppercase tracking-widest">
      Loading chart
    </div>
  ),
});

type PieTooltipItem = {
  label: string;
  parsed: number | null;
  dataset: { data: number[] };
};

const HomeCharts = () => {
  const windowWidth = useWindowWidth(1024);
  const [chartsReady, setChartsReady] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    // Chart.js evaluation is main-thread work that delays first paint of the
    // hero text when it starts on mount. Wait until the stats section is close.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        import("chart.js").then(({ Chart, ArcElement, Tooltip, Legend }) => {
          Chart.register(ArcElement, Tooltip, Legend);
          setChartsReady(true);
        });
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        tooltip: {
          callbacks: {
            label: (context: PieTooltipItem) => {
              const data = context.dataset.data as number[];
              const sum = data.reduce((a, b) => a + b, 0);
              const value = context.parsed;
              if (value === null) return `${context.label}: N/A`;
              const percent = Math.round((value * 1000) / sum) / 10;
              return ` ${context.label}: ${value} (${percent}%)`;
            },
          },
          backgroundColor: "rgba(5, 5, 5, 0.95)",
          borderColor: "#00A8A8",
          borderWidth: 1,
          titleFont: { family: "monospace" },
          bodyFont: { family: "monospace" },
          padding: 12,
          cornerRadius: 4,
        },
        legend: {
          position: "bottom" as const,
          labels: {
            color: "#94a3b8",
            font: { family: "monospace", size: windowWidth < 640 ? 10 : 11 },
            padding: windowWidth < 640 ? 10 : 15,
            boxWidth: windowWidth < 640 ? 8 : 12,
          },
        },
      },
    }),
    [windowWidth],
  );

  return (
    <div
      ref={gridRef}
      className="grid lg:grid-cols-2 gap-6 md:gap-8 max-w-6xl mx-auto items-stretch"
    >
      <div className="glass-card p-5 sm:p-8 rounded-3xl flex flex-col items-center transition-all group shadow-2xl">
        <p className="text-xs font-mono text-gray-400 mb-6 uppercase tracking-widest border-b border-white/5 pb-2 w-full text-center group-hover:text-[#00A8A8] transition-colors">
          Class Year Distribution
        </p>
        <div className="w-full relative flex items-center justify-center">
          <div className="w-full max-w-[280px] sm:max-w-[320px] aspect-square">
            {chartsReady ? (
              <Pie data={ClassData} options={chartOptions} />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500 font-mono text-xs uppercase tracking-widest">
                Loading chart
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="glass-card p-5 sm:p-8 rounded-3xl flex flex-col items-center transition-all group shadow-2xl">
        <p className="text-xs font-mono text-gray-400 mb-6 uppercase tracking-widest border-b border-white/5 pb-2 w-full text-center group-hover:text-[#00A8A8] transition-colors">
          Academic Major Split
        </p>
        <div className="w-full relative flex items-center justify-center">
          <div className="w-full max-w-[280px] sm:max-w-[320px] aspect-square">
            {chartsReady ? (
              <Pie data={MajorData} options={chartOptions} />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500 font-mono text-xs uppercase tracking-widest">
                Loading chart
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomeCharts;
