"use client";

import React from "react";
import { READ_ONLY_TITLE } from "@/lib/use-portal-context";

/** A labelled checkbox that saves as soon as it changes. 44px tall so it
 *  works as a tap target on the phone an organiser carries. */
export function Toggle({
  id,
  checked,
  disabled,
  readOnly = false,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  readOnly?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label
      htmlFor={id}
      title={readOnly ? READ_ONLY_TITLE : undefined}
      className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] text-[var(--text-primary)]"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer rounded-sm accent-[var(--accent)] disabled:cursor-not-allowed"
      />
      {label}
    </label>
  );
}
