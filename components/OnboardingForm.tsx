"use client";

import { useState } from "react";
import { Upload, X, FileText } from "lucide-react";
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
  resume?: File | null;
}

export default function OnboardingForm() {
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
    resume: null,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dragActive, setDragActive] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, type, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleFile = (file: File) => {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      setFormData((prev) => ({ ...prev, resume: file }));
      setFieldErrors((prev) => ({ ...prev, resume: "" }));
    } else {
      setFieldErrors((prev) => ({ ...prev, resume: "Only PDF files are allowed." }));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  };

  const removeResume = () => setFormData((prev) => ({ ...prev, resume: null }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);

    const requiredFields = ["fullName", "school", "major", "levelOfStudy", "graduationYear", "shirtSize"];
    const newErrors: Record<string, string> = {};

    requiredFields.forEach((field) => {
      if (!formData[field as keyof OnboardingFormData]) newErrors[field] = "This field is required.";
    });
    if (!formData.agreeToCodeOfConduct) newErrors.agreeToCodeOfConduct = "You must agree to the MLH Code of Conduct.";
    if (!formData.resume) newErrors.resume = "Please upload your resume in PDF format.";

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const formDataToSend = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        if (key === "resume" && value) formDataToSend.append(key, value);
        else if (key !== "resume") formDataToSend.append(key, String(value));
      });

      await submitOnboardingForm(formDataToSend);
      setSuccess(true);
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Unexpected error");
      setLoading(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => currentYear + i);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 bg-clip-text text-transparent mb-3">
            Welcome aboard
          </h1>
          <p className="text-slate-600 text-lg">Let's get you set up in just a few steps</p>
        </div>

        {success && (
          <div className="mb-6 p-4 bg-green-100 border border-green-300 rounded-lg text-green-700 text-center flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Registration submitted successfully!
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <p className="text-red-600 text-center text-sm font-medium">{error}</p>
          )}

          {/* Personal Information */}
          <Section title="Personal Information">
            <div className="grid md:grid-cols-2 gap-5">
              <InputField label="Full Name" name="fullName" value={formData.fullName} onChange={handleChange} error={fieldErrors.fullName} />
              <InputField label="School" name="school" value={formData.school} onChange={handleChange} error={fieldErrors.school} />
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              <InputField label="Major" name="major" value={formData.major} onChange={handleChange} error={fieldErrors.major} />
              <SelectField
                label="Level of Study"
                name="levelOfStudy"
                value={formData.levelOfStudy}
                onChange={handleChange}
                options={[
                  { label: "High School", value: "high_school" },
                  { label: "Undergraduate", value: "undergraduate" },
                  { label: "Graduate", value: "graduate" },
                  { label: "PhD", value: "phd" },
                  { label: "Professional", value: "professional" },
                ]}
                error={fieldErrors.levelOfStudy}
              />
            </div>
            <SelectField
              label="Expected Graduation"
              name="graduationYear"
              value={formData.graduationYear}
              onChange={handleChange}
              options={years.map((y) => ({ label: y.toString(), value: y.toString() }))}
              error={fieldErrors.graduationYear}
            />
          </Section>

          {/* Resume Upload */}
          <Section title="Resume">
            {!formData.resume ? (
              <div
                onDragEnter={() => setDragActive(true)}
                onDragLeave={() => setDragActive(false)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                  fieldErrors.resume
                    ? "border-red-500 bg-red-50"
                    : dragActive
                    ? "border-purple-500 bg-purple-50"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                <p className="text-slate-700 font-medium mb-1">Drop your resume or click below</p>
                <p className="text-slate-500 text-sm mb-4">PDF format only</p>
                <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer">
                  <FileText className="w-4 h-4" />
                  Choose File
                  <input type="file" accept=".pdf" onChange={handleFileInput} className="hidden" />
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <FileText className="w-6 h-6 text-purple-600" />
                <p className="text-slate-900 font-medium truncate">{formData.resume.name}</p>
                <button type="button" onClick={removeResume} className="ml-auto text-slate-400 hover:text-red-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
            {fieldErrors.resume && <p className="text-red-500 text-sm mt-2">{fieldErrors.resume}</p>}
          </Section>

          {/* Professional Links */}
          <Section title="Professional Links" subtitle="Optional but recommended">
            <InputField label="GitHub" name="github" value={formData.github} onChange={handleChange} placeholder="github.com/username" />
            <InputField label="LinkedIn" name="linkedin" value={formData.linkedin} onChange={handleChange} placeholder="linkedin.com/in/username" />
          </Section>

          {/* Additional Details */}
          <Section title="Additional Details">
            <SelectField
              label="T-Shirt Size"
              name="shirtSize"
              value={formData.shirtSize}
              onChange={handleChange}
              options={[
                { label: "XS", value: "xs" },
                { label: "S", value: "s" },
                { label: "M", value: "m" },
                { label: "L", value: "l" },
                { label: "XL", value: "xl" },
              ]}
              error={fieldErrors.shirtSize}
            />
            <TextAreaField label="Dietary Restrictions" name="dietaryRestrictions" value={formData.dietaryRestrictions} onChange={handleChange} />
            <TextAreaField label="Skills & Interests" name="skills" value={formData.skills} onChange={handleChange} />
          </Section>

          {/* Code of Conduct */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="agreeToCodeOfConduct"
                checked={formData.agreeToCodeOfConduct}
                onChange={handleChange}
                className={`w-5 h-5 border-2 rounded transition-all cursor-pointer ${
                  fieldErrors.agreeToCodeOfConduct
                    ? "border-red-500"
                    : "border-slate-300"
                } checked:bg-purple-600 checked:border-purple-600`}
              />
              <span className="text-slate-600 text-sm">
                I agree to the{" "}
                <a href="https://static.mlh.io/docs/mlh-code-of-conduct.pdf" target="_blank" rel="noopener noreferrer" className="text-purple-600 font-medium underline">
                  MLH Code of Conduct
                </a>
              </span>
            </label>
            {fieldErrors.agreeToCodeOfConduct && <p className="text-red-500 text-sm mt-2">{fieldErrors.agreeToCodeOfConduct}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:shadow-lg disabled:opacity-60 transition-all"
          >
            {loading ? "Submitting..." : "Complete Registration"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* Reusable UI components */
const Section = ({ title, subtitle, children }: any) => (
  <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
    <div className="bg-gradient-to-r from-purple-500/5 to-pink-500/5 px-6 py-4 border-b border-slate-100">
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
    </div>
    <div className="p-6 space-y-5">{children}</div>
  </div>
);

const InputField = ({ label, name, value, onChange, placeholder, error }: any) => (
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
    <input
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

const SelectField = ({ label, name, value, onChange, options, error }: any) => (
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
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
    {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
  </div>
);

const TextAreaField = ({ label, name, value, onChange }: any) => (
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
    <textarea
      name={name}
      value={value}
      onChange={onChange}
      rows={3}
      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none"
    />
  </div>
);
