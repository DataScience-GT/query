"use client";

import { ChangeEvent } from "react";

interface InlineRadioInputProps {
  color: string;
  label: string;
  value: string;
  name: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  checked?: boolean;
}

export default function InlineRadioInput({
  color,
  label,
  value,
  name,
  onChange,
  type = "radio",
  checked = false,
}: InlineRadioInputProps) {
  const id = `${label.replaceAll(" ", "-")}-${name.replaceAll(" ", "-")}`;

  return (
    <div className="inline-block">
      <input
        id={id}
        type={type}
        name={name}
        value={value}
        className="hidden"
        onChange={onChange}
        checked={checked}
      />
      <label
        htmlFor={id}
        className={`block px-3 py-1 rounded-lg font-normal cursor-pointer transition-all duration-300 hover:-translate-y-1`}
        style={{
          backgroundColor: checked ? color : "#eee",
          borderColor: color,
          color: checked ? "#fff" : "#000",
        }}
      >
        {label}
      </label>
    </div>
  );
}
