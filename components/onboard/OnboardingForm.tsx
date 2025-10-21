"use client";

import { useState, useMemo } from "react";
import Section from "./Section";
import InputField from "./fields/InputField";
import SelectField from "./fields/SelectField";
import TextAreaField from "./fields/TextAreaField";
import ResumeUpload from "./ResumeUpload";
import { submitOnboardingForm } from "@/app/actions/onboarding";

import schools from "./data/schools.json";
import majors from "./data/majors.json";

// Updated dietary restrictions
const ALLERGIES = [
  "Milk",
  "Eggs",
  "Fish",
  "Crustacean Shellfish",
  "Tree Nuts",
  "Peanuts",
  "Wheat",
  "Soybeans",
  "Halal",
  "Kosher",
  "Vegetarian",
  "Vegan"
];

const GENDERS = ["Male","Female","Non-binary","Prefer not to say"];
const RACES = ["American Indian or Alaska Native","Asian","Black or African American","Hispanic or Latino","Native Hawaiian or Other Pacific Islander","White","Other","Prefer not to say"];
const LEVELS = [
  {label:"High School",value:"high_school"},
  {label:"Undergraduate",value:"undergraduate"},
  {label:"Graduate",value:"graduate"},
  {label:"PhD",value:"phd"},
  {label:"Professional",value:"professional"}
];
const SHIRT_SIZES = ["XS","S","M","L","XL","XXL"];

interface OnboardingFormData {
  fullName: string;
  school: string;
  major: string;
  levelOfStudy: string;
  graduationYear: string;
  dob: string;
  github: string;
  linkedin: string;
  personalWebsite: string;
  shirtSize: string;
  gender: string;
  raceEthnicity: string;
  dietaryRestrictions: string[];
  skills: string;
  motivation: string;
  goals: string;
  firstHackathon: boolean;
  agreeToCodeOfConduct: boolean;
  agreeToMLHPrivacy: boolean;
  agreeToEmailConsent: boolean;
  agreeToTOS: boolean;
  resume?: File | null;
}

export default function OnboardingForm() {
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: 8 }, (_, i) => currentYear + i), [currentYear]);

  const [formData, setFormData] = useState<OnboardingFormData>({
    fullName: "",
    school: "",
    major: "",
    levelOfStudy: "",
    graduationYear: "",
    dob: "",
    github: "",
    linkedin: "",
    personalWebsite: "",
    shirtSize: "",
    gender: "",
    raceEthnicity: "",
    dietaryRestrictions: [],
    skills: "",
    motivation: "",
    goals: "",
    firstHackathon: false,
    agreeToCodeOfConduct: false,
    agreeToMLHPrivacy: false,
    agreeToEmailConsent: false,
    agreeToTOS: false,
    resume: null,
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<any>) => {
    const { name, type, value, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setFieldErrors(prev => ({ ...prev, [name]: "" }));
  };

  const toggleAllergy = (allergy: string) => {
    setFormData(prev => ({
      ...prev,
      dietaryRestrictions: prev.dietaryRestrictions.includes(allergy)
        ? prev.dietaryRestrictions.filter(a => a !== allergy)
        : [...prev.dietaryRestrictions, allergy],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const newErrors: Record<string,string> = {};
    const requiredFields: (keyof OnboardingFormData)[] = [
      "fullName","school","major","levelOfStudy","graduationYear","shirtSize","dob","motivation","goals"
    ];
    requiredFields.forEach(f => {
      if(!formData[f]) newErrors[f] = "This field is required";
    });

    if(!formData.agreeToCodeOfConduct) newErrors.agreeToCodeOfConduct = "You must agree to the Code of Conduct";
    if(!formData.agreeToMLHPrivacy) newErrors.agreeToMLHPrivacy = "You must agree to MLH Privacy Policy";
    if(!formData.agreeToTOS) newErrors.agreeToTOS = "You must agree to Hacklytics TOS";

    if(Object.keys(newErrors).length > 0){
      setFieldErrors(newErrors);
      setLoading(false);
      return;
    }

    try{
      const data = new FormData();
      Object.entries(formData).forEach(([key,value]) => {
        if(key === "resume" && value) data.append(key,value as File);
        else if(key === "dietaryRestrictions") data.append(key,JSON.stringify(value));
        else data.append(key,String(value));
      });

      await submitOnboardingForm(data);
      setSuccess(true);
    }catch(err:any){
      setError(err.message || "Unexpected error");
    }finally{
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 mb-3">
          Welcome aboard
        </h1>
        <p className="text-center text-slate-600 text-lg mb-8">Let's get you set up in just a few steps</p>

        {success && <p className="text-green-600 text-center mb-4">Registration submitted successfully!</p>}
        {error && <p className="text-red-600 text-center mb-4">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-8">

          {/* Personal Info */}
          <Section title="Personal Information">
            <div className="grid md:grid-cols-2 gap-5">
              <SelectField 
                label="School *" 
                name="school" 
                value={formData.school} 
                onChange={handleChange} 
                options={schools.map(s=>({label:s,value:s}))} 
                error={fieldErrors.school} 
                small
              />
              <SelectField 
                label="Major *" 
                name="major" 
                value={formData.major} 
                onChange={handleChange} 
                options={Object.values(majors).flat().map(m=>({label:m,value:m}))} 
                error={fieldErrors.major} 
                small
              />
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              <SelectField label="Level of Study *" name="levelOfStudy" value={formData.levelOfStudy} onChange={handleChange} options={LEVELS} error={fieldErrors.levelOfStudy}/>
              <SelectField label="Gender" name="gender" value={formData.gender} onChange={handleChange} options={GENDERS.map(g=>({label:g,value:g}))}/>
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              <SelectField label="Race / Ethnicity" name="raceEthnicity" value={formData.raceEthnicity} onChange={handleChange} options={RACES.map(r=>({label:r,value:r}))}/>
              <SelectField label="Graduation Year *" name="graduationYear" value={formData.graduationYear} onChange={handleChange} options={years.map(y=>({label:y.toString(),value:y.toString()}))} error={fieldErrors.graduationYear}/>
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              <InputField label="Full Name *" name="fullName" value={formData.fullName} onChange={handleChange} error={fieldErrors.fullName}/>
              <InputField label="Date of Birth *" type="date" name="dob" value={formData.dob} onChange={handleChange} error={fieldErrors.dob}/>
            </div>
          </Section>

          {/* Dietary Restrictions */}
          <Section title="Dietary Restrictions">
            <div className="flex flex-wrap gap-2 mt-2">
              {ALLERGIES.map(a=>(
                <button key={a} type="button" onClick={()=>toggleAllergy(a)} className={`px-3 py-1 rounded-full border ${formData.dietaryRestrictions.includes(a)?"bg-purple-600 text-white border-purple-600":"bg-white text-gray-700 border-gray-300"} text-sm`}>
                  {a}
                </button>
              ))}
            </div>
          </Section>

          {/* Accounts & Social */}
          <Section title="Accounts & Social">
            <div className="grid md:grid-cols-2 gap-5">
              <InputField label="GitHub" name="github" value={formData.github} onChange={handleChange}/>
              <InputField label="LinkedIn" name="linkedin" value={formData.linkedin} onChange={handleChange}/>
            </div>
            <InputField label="Personal Website" name="personalWebsite" value={formData.personalWebsite} onChange={handleChange}/>
          </Section>

          {/* Preferences & Skills */}
          <Section title="Preferences & Skills">
            <SelectField label="Shirt Size *" name="shirtSize" value={formData.shirtSize} onChange={handleChange} options={SHIRT_SIZES.map(s=>({label:s,value:s}))} error={fieldErrors.shirtSize}/>
            <TextAreaField label="Skills / Interests" name="skills" value={formData.skills} onChange={handleChange}/>
          </Section>

          {/* Motivation & Goals */}
          <Section title="Motivation & Goals">
            <TextAreaField label="Why do you want to attend Hacklytics? *" name="motivation" value={formData.motivation} onChange={handleChange} error={fieldErrors.motivation}/>
            <TextAreaField label="What do you hope to achieve at Hacklytics? *" name="goals" value={formData.goals} onChange={handleChange} error={fieldErrors.goals}/>
            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" name="firstHackathon" checked={formData.firstHackathon} onChange={handleChange} className="h-4 w-4 rounded border-slate-300 focus:ring-2 focus:ring-purple-200"/>
              <span className="text-sm text-slate-700">This is my first time participating in a Hackathon</span>
            </label>
          </Section>

          {/* Resume & Agreements */}
          <Section title="Resume & Agreements">
            <ResumeUpload resume={formData.resume} setResume={(f)=>setFormData(prev=>({...prev,resume:f}))} error={fieldErrors.resume}/>

            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" name="agreeToCodeOfConduct" checked={formData.agreeToCodeOfConduct} onChange={handleChange} className="h-4 w-4 rounded border-slate-300 focus:ring-2 focus:ring-purple-200"/>
              <span className="text-sm text-slate-700">
                I have read and agree to the <a href="https://github.com/MLH/mlh-policies/blob/main/code-of-conduct.md" target="_blank" className="text-purple-600 underline">MLH Code of Conduct</a> *
              </span>
            </label>
            {fieldErrors.agreeToCodeOfConduct && <p className="text-red-500 text-sm mt-1">{fieldErrors.agreeToCodeOfConduct}</p>}

            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" name="agreeToMLHPrivacy" checked={formData.agreeToMLHPrivacy} onChange={handleChange} className="h-4 w-4 rounded border-slate-300 focus:ring-2 focus:ring-purple-200"/>
              <span className="text-sm text-slate-700">
                I authorize sharing my info with MLH and agree to the <a href="https://github.com/MLH/mlh-policies/blob/main/privacy-policy.md" target="_blank" className="text-purple-600 underline">MLH Privacy Policy</a> *
              </span>
            </label>
            {fieldErrors.agreeToMLHPrivacy && <p className="text-red-500 text-sm mt-1">{fieldErrors.agreeToMLHPrivacy}</p>}

            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" name="agreeToEmailConsent" checked={formData.agreeToEmailConsent} onChange={handleChange} className="h-4 w-4 rounded border-slate-300 focus:ring-2 focus:ring-purple-200"/>
              <span className="text-sm text-slate-700">I authorize MLH to send occasional emails</span>
            </label>

            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" name="agreeToTOS" checked={formData.agreeToTOS} onChange={handleChange} className="h-4 w-4 rounded border-slate-300 focus:ring-2 focus:ring-purple-200"/>
              <span className="text-sm text-slate-700">
                I agree to the <a href="https://knight-hacks.notion.site/kh-25-tos" target="_blank" className="text-purple-600 underline">Hacklytics Terms of Service</a> *
              </span>
            </label>
            {fieldErrors.agreeToTOS && <p className="text-red-500 text-sm mt-1">{fieldErrors.agreeToTOS}</p>}
          </Section>

          <button type="submit" disabled={loading} className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-all disabled:opacity-60">
            {loading ? "Submitting..." : "Submit"}
          </button>
        </form>
      </div>
    </div>
  );
}
