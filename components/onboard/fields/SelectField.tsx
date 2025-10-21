"use client";

interface SelectFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<any>) => void;
  options: { label: string; value: string }[];
  error?: string;
}

export default function SelectField({ label, name, value, onChange, options, error }: SelectFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className={`w-full px-4 py-3 border rounded-xl focus:outline-none transition-all appearance-none ${
          error ? "border-red-500 focus:ring-2 focus:ring-red-200" : "border-slate-200 focus:ring-2 focus:ring-purple-200"
        }`}
      >
        <option value="">Select</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  );
}
