"use client";

import React from "react";

type StepProps = {
  activeStep: number;
  setActiveStep: (step: number) => void;
  steps: { num: number; label: string; done: boolean }[];
};

export function SetupWizard({ activeStep, setActiveStep, steps }: StepProps) {
  return (
    <div className="flex items-center gap-2 mb-12 overflow-x-auto pb-4">
      {steps.map((s, i) => (
        <React.Fragment key={s.num}>
          <button
            onClick={() => setActiveStep(s.num)}
            className={`flex items-center gap-3 px-5 py-3 rounded-none border transition-all text-xs font-bold uppercase tracking-widest font-mono shrink-0 ${
              activeStep === s.num
                ? "bg-accent/10 border-accent/40 text-[var(--text-primary)]"
                : s.done
                  ? "bg-accent/10 border-accent/30 text-accent"
                  : "bg-white/[0.02] border-[var(--border-subtle)] text-gray-600"
            }`}
          >
            <span
              className={`w-6 h-6 rounded-sm flex items-center justify-center text-[10px] font-black shrink-0 ${
                s.done
                  ? "bg-accent/20 text-accent"
                  : activeStep === s.num
                    ? "bg-accent/20 text-accent"
                    : "bg-white/5 text-gray-600"
              }`}
            >
              {s.done ? "\u2713" : s.num}
            </span>
            {s.label}
          </button>
          {i < steps.length - 1 && (
            <div className="w-6 h-px bg-white/10 shrink-0" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
