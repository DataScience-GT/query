"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitOnboardingForm } from "@/app/actions/onboarding";

interface OnboardingFormData {
  fullName: string;
  school: string;
  major: string;
  levelOfStudy: string;
  graduationYear: string;
  github: string;
  linkedin: string;
  shirtSize: string;
  dietaryRestrictions: string;
  skills: string;
  agreeToCodeOfConduct: boolean;
}

export default function OnboardingForm() {
  const router = useRouter();
  const [formData, setFormData] = useState<OnboardingFormData>({
    fullName: "",
    school: "",
    major: "",
    levelOfStudy: "",
    graduationYear: "",
    github: "",
    linkedin: "",
    shirtSize: "",
    dietaryRestrictions: "",
    skills: "",
    agreeToCodeOfConduct: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, type, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.agreeToCodeOfConduct) {
      setError("You must agree to the MLH Code of Conduct.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await submitOnboardingForm(formData);
      if (!result.success) {
        throw new Error(result.error || "Failed to submit form");
      }
      // Force a hard refresh to the portal to ensure session is updated
      window.location.href = "/portal";
    } catch (err: any) {
      setError(err.message || "Unexpected error");
      setLoading(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => currentYear + i);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-8 bg-white rounded-2xl shadow-lg max-w-xl mx-auto mt-12">
      <h1 className="text-3xl font-bold text-center mb-6">Complete Your Registration</h1>
      
      {error && (
        <div className="text-red-700 bg-red-100 p-3 rounded border border-red-300">
          {error}
        </div>
      )}

      <InputField 
        label="Full Name" 
        name="fullName" 
        value={formData.fullName} 
        onChange={handleChange} 
        required 
      />
      
      <InputField 
        label="School" 
        name="school" 
        value={formData.school} 
        onChange={handleChange} 
        required 
      />
      
      <InputField 
        label="Major" 
        name="major" 
        value={formData.major} 
        onChange={handleChange} 
        required 
      />
      
      <SelectField 
        label="Level of Study" 
        name="levelOfStudy" 
        value={formData.levelOfStudy} 
        onChange={handleChange} 
        required
        options={[
          { label: "High School", value: "high_school" },
          { label: "Undergraduate", value: "undergraduate" },
          { label: "Graduate", value: "graduate" },
          { label: "PhD", value: "phd" },
          { label: "Professional", value: "professional" },
        ]}
      />
      
      <SelectField 
        label="Graduation Year" 
        name="graduationYear" 
        value={formData.graduationYear} 
        onChange={handleChange} 
        required
        options={years.map(y => ({ label: y.toString(), value: y.toString() }))}
      />

      <InputField 
        label="GitHub Username (Optional)" 
        name="github" 
        value={formData.github} 
        onChange={handleChange} 
      />
      
      <InputField 
        label="LinkedIn Profile (Optional)" 
        name="linkedin" 
        value={formData.linkedin} 
        onChange={handleChange} 
      />

      <SelectField 
        label="Shirt Size" 
        name="shirtSize" 
        value={formData.shirtSize} 
        onChange={handleChange} 
        options={[
          { label: "XS", value: "xs" },
          { label: "S", value: "s" },
          { label: "M", value: "m" },
          { label: "L", value: "l" },
          { label: "XL", value: "xl" },
          { label: "XXL", value: "xxl" },
        ]}
      />

      <div>
        <label className="block mb-2 font-medium">Dietary Restrictions (Optional)</label>
        <textarea 
          name="dietaryRestrictions" 
          value={formData.dietaryRestrictions} 
          onChange={handleChange}
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          placeholder="Any allergies or dietary preferences?"
        />
      </div>

      <div>
        <label className="block mb-2 font-medium">Skills & Interests (Optional)</label>
        <textarea 
          name="skills" 
          value={formData.skills} 
          onChange={handleChange}
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          placeholder="Programming languages, frameworks, interests..."
        />
      </div>

      <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-lg">
        <input 
          type="checkbox" 
          name="agreeToCodeOfConduct" 
          checked={formData.agreeToCodeOfConduct} 
          onChange={handleChange}
          className="mt-1 w-4 h-4 text-purple-600 focus:ring-purple-500 rounded"
          required
        />
        <span className="text-sm">
          I agree to the{" "}
          <a 
            href="https://static.mlh.io/docs/mlh-code-of-conduct.pdf" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-purple-600 hover:underline font-medium"
          >
            MLH Code of Conduct
          </a>
          {" *"}
        </span>
      </div>

      <button 
        type="submit" 
        disabled={loading} 
        className="w-full py-3 px-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
      >
        {loading ? "Submitting..." : "Complete Registration"}
      </button>
    </form>
  );
}

interface InputFieldProps {
  label: string;
  name: keyof OnboardingFormData;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}

const InputField = ({ label, name, value, onChange, required = false }: InputFieldProps) => (
  <div>
    <label className="block mb-2 font-medium">
      {label}{required && " *"}
    </label>
    <input 
      name={name} 
      value={value} 
      onChange={onChange} 
      required={required} 
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
    />
  </div>
);

interface SelectFieldProps {
  label: string;
  name: keyof OnboardingFormData;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { label: string; value: string }[];
  required?: boolean;
}

const SelectField = ({ label, name, value, onChange, options, required = false }: SelectFieldProps) => (
  <div>
    <label className="block mb-2 font-medium">
      {label}{required && " *"}
    </label>
    <select 
      name={name} 
      value={value} 
      onChange={onChange} 
      required={required}
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
    >
      <option value="">Select</option>
      {options.map((opt, i) => (
        <option key={i} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);