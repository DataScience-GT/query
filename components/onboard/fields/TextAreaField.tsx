"use client";

interface TextAreaFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<any>) => void;
  error?: string;
}

export default function TextAreaField({ label, name, value, onChange, error }: TextAreaFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        rows={3}
        className={`w-full px-4 py-3 border rounded-xl focus:outline-none transition-all resize-none ${
          error ? "border-red-500 focus:ring-2 focus:ring-red-200" : "border-slate-200 focus:ring-2 focus:ring-purple-200"
        }`}
      />
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  );
}
