"use client";
import { useState } from "react";
import { Upload, X, FileText } from "lucide-react";

interface Props {
  resume?: File | null;
  setResume: (file: File | null) => void;
	error?: string;
}

export default function ResumeUpload({ resume, setResume, error }: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [resumeError, setResumeError] = useState("");

  const handleFile = (file: File) => {
    if (file.type !== "application/pdf") {
      setResumeError("File must be a PDF");
      setResume(null);
      return;
    }
    if (file.size > 1024 * 1024) { // 1MB
      setResumeError("File size cannot exceed 1MB");
      setResume(null);
      return;
    }
    setResumeError("");
    setResume(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const removeResume = () => {
    setResume(null);
    setResumeError("");
  };

  return (
    <div
      className={`flex flex-col items-center justify-center border-dashed border-2 rounded-xl p-6 text-center cursor-pointer ${dragActive ? "border-purple-400 bg-purple-50" : "border-slate-300 bg-white"}`}
      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
      {resume ? (
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-purple-500" />
          <span>{resume.name}</span>
          <X className="w-5 h-5 cursor-pointer text-red-500" onClick={removeResume} />
        </div>
      ) : (
        <label className="flex flex-col items-center gap-2 cursor-pointer">
          <Upload className="w-6 h-6 text-purple-500" />
          <span>Drag & drop or click to upload your PDF resume</span>
          <input type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
        </label>
      )}
      {(resumeError || error) && <p className="text-red-500 text-sm mt-2">{resumeError || error}</p>}
    </div>
  );
}
