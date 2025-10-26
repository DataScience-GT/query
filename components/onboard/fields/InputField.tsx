"use client";

import { HTMLInputTypeAttribute } from "react";

interface InputFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<any>) => void;
  placeholder?: string;
  error?: string;
  type?: HTMLInputTypeAttribute;
}

export default function InputField({ label, name, value, onChange, placeholder, error, type = "text" }: InputFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full px-4 py-3 border rounded-xl focus:outline-none transition-all ${
          error ? "border-red-500 focus:ring-2 focus:ring-red-200" : "border-slate-200 focus:ring-2 focus:ring-purple-200"
        }`}
      />
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  );
}
