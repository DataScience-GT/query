'use client';

import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import {
    FormInput, FormTextarea, FormChipSelect, FormMultiChipSelect, SearchableSelect,
    StepProgress, StepContainer, FormErrorAlert, FormNavigation
} from '@/components/hackathon/FormComponents';
import {
    SHIRT_SIZES, DIETARY_OPTIONS, LEVELS_OF_STUDY, GENDERS,
    REGISTRATION_STEPS, SCHOOLS, MAJORS,
} from '@/components/hackathon/constants';
import type { ShirtSize, LevelOfStudy } from '@/components/hackathon/constants';

type RegistrationStep = 0 | 1 | 2 | 3;

function formatDate(d: Date | string) {
    return new Date(d).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}

export function InfoTab({
    hackathon,
    isRegistered,
    myReg,
}: {
    hackathon: {
        id: string;
        name: string;
        description?: string | null;
        prizes?: { place: string; amount: number; description?: string }[] | null;
        rules?: string | null;
        registrationDeadline?: string | Date | null;
        websiteUrl?: string | null;
        status: string;
        maxParticipants?: number | null;
        currentParticipants: number;
        theme?: string | null;
    };
    isRegistered: boolean;
    myReg?: { registrationStatus: string; teamId?: string | null } | null;
}) {
    const [showForm, setShowForm] = useState(false);
    const [step, setStep] = useState<RegistrationStep>(0);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    // Step 1: Personal Info
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [age, setAge] = useState('');
    const [gender, setGender] = useState('');

    // Step 2: Academic
    const [school, setSchool] = useState('');
    const [major, setMajor] = useState('');
    const [graduationYear, setGraduationYear] = useState('');
    const [levelOfStudy, setLevelOfStudy] = useState('');
    const [country, setCountry] = useState('United States');

    // Step 3: Experience
    const [hackathonsAttended, setHackathonsAttended] = useState('');
    const [resumeUrl, setResumeUrl] = useState('');
    const [linkedinUrl, setLinkedinUrl] = useState('');
    const [githubUrl, setGithubUrl] = useState('');
    const [whyAttend, setWhyAttend] = useState('');

    // Step 4: Logistics
    const [shirtSize, setShirtSize] = useState<ShirtSize | ''>('');
    const [dietary, setDietary] = useState<string[]>([]);
    const [emergencyContact, setEmergencyContact] = useState('');
    const [emergencyPhone, setEmergencyPhone] = useState('');
    const [agreeToCoC, setAgreeToCoC] = useState(false);

    const utils = trpc.useUtils();
    const registerMutation = trpc.hackathon.register.useMutation({
        onSuccess: () => {
            setSuccess(true);
            setShowForm(false);
            utils.hackathon.myRegistrations.invalidate();
            utils.hackathon.list.invalidate();
            utils.hackathon.getById.invalidate({ id: hackathon.id });
        },
        onError: (e) => setError(e.message),
    });

    const isFull = !!(hackathon.maxParticipants && hackathon.currentParticipants >= hackathon.maxParticipants);
    const deadlinePassed = !!(hackathon.registrationDeadline && new Date(hackathon.registrationDeadline) < new Date());
    const canRegister = hackathon.status === 'open' && !isRegistered && !isFull && !deadlinePassed;

    function validateStep(s: RegistrationStep): boolean {
        setError('');
        if (s === 0) {
            if (!firstName.trim() || !lastName.trim()) { setError('First and last name are required.'); return false; }
            if (!phone.trim()) { setError('Phone number is required.'); return false; }
            if (!age || parseInt(age) < 13 || parseInt(age) > 120) { setError('Please enter a valid age (13-120).'); return false; }
        } else if (s === 1) {
            if (!school.trim()) { setError('School / university is required.'); return false; }
            if (!major.trim()) { setError('Major / field of study is required.'); return false; }
            if (!graduationYear || parseInt(graduationYear) < 2020 || parseInt(graduationYear) > 2035) { setError('Please enter a valid graduation year.'); return false; }
            if (!levelOfStudy) { setError('Level of study is required.'); return false; }
            if (!country.trim()) { setError('Country is required.'); return false; }
        } else if (s === 3) {
            if (!agreeToCoC) { setError('You must agree to the Code of Conduct.'); return false; }
        }
        return true;
    }

    function handleNext() {
        if (!validateStep(step)) return;
        setStep((s) => Math.min(s + 1, 3) as RegistrationStep);
    }

    function handleBack() {
        setError('');
        setStep((s) => Math.max(s - 1, 0) as RegistrationStep);
    }

    function handleSubmit() {
        if (!validateStep(3)) return;
        setError('');
        registerMutation.mutate({
            hackathonId: hackathon.id,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone.trim(),
            age: parseInt(age),
            gender: gender || undefined,
            school: school.trim(),
            major: major.trim(),
            graduationYear: parseInt(graduationYear),
            levelOfStudy: levelOfStudy as LevelOfStudy,
            country: country.trim(),
            hackathonsAttended: hackathonsAttended ? parseInt(hackathonsAttended) : undefined,
            resumeUrl: resumeUrl.trim() || undefined,
            linkedinUrl: linkedinUrl.trim() || undefined,
            githubUrl: githubUrl.trim() || undefined,
            whyAttend: whyAttend.trim() || undefined,
            shirtSize: shirtSize || undefined,
            dietaryRestrictions: dietary.length ? dietary : undefined,
            emergencyContact: emergencyContact.trim() || undefined,
            emergencyPhone: emergencyPhone.trim() || undefined,
            agreeToCodeOfConduct: agreeToCoC,
        });
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {hackathon.description && (
                <LiquidGlass className="p-8 bg-white/[0.01] border-white/5">
                    <h3 className="text-[11px] uppercase tracking-widest font-bold text-cyan-400 mb-4 inline-flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        About
                    </h3>
                    <p className="text-white/60 text-sm leading-relaxed whitespace-pre-wrap font-medium">{hackathon.description}</p>
                </LiquidGlass>
            )}

            {hackathon.prizes && hackathon.prizes.length > 0 && (
                <LiquidGlass className="p-8 bg-white/[0.01] border-white/5">
                    <h3 className="text-[11px] uppercase tracking-widest font-bold text-cyan-400 mb-6 inline-flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
                        Prizes
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {hackathon.prizes.map((p: { place: string; amount: number; description?: string }, i: number) => (
                            <div key={i} className="p-6 bg-[#0a0a0a]/50 border border-white/5 rounded-2xl hover:border-cyan-500/30 transition-colors group relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                <p className="text-white font-bold text-lg mb-1 relative z-10">{p.place}</p>
                                <p className="text-white/80 font-semibold text-2xl mb-2 relative z-10">${p.amount.toLocaleString()}</p>
                                {p.description && <p className="text-white/40 text-xs relative z-10">{p.description}</p>}
                            </div>
                        ))}
                    </div>
                </LiquidGlass>
            )}

            {hackathon.rules && (
                <LiquidGlass className="p-8 bg-white/[0.01] border-white/5">
                    <h3 className="text-[11px] uppercase tracking-widest font-bold text-cyan-400 mb-4 inline-flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Rules
                    </h3>
                    <p className="text-white/50 text-sm leading-relaxed whitespace-pre-wrap">{hackathon.rules}</p>
                </LiquidGlass>
            )}

            {(hackathon.registrationDeadline || hackathon.websiteUrl) && (
                <div className="flex flex-wrap gap-4 px-2">
                    {hackathon.registrationDeadline && (
                        <div className="flex items-center gap-2.5 text-sm font-semibold bg-white/5 border border-white/5 px-4 py-2 rounded-xl">
                            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span className={deadlinePassed ? 'text-rose-400' : 'text-amber-400'}>
                                Deadline: {formatDate(hackathon.registrationDeadline)}{deadlinePassed ? ' (Passed)' : ''}
                            </span>
                        </div>
                    )}
                    {hackathon.websiteUrl && (
                        <a href={hackathon.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-sm font-semibold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 px-4 py-2 rounded-xl transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            Official Website
                        </a>
                    )}
                </div>
            )}

            <LiquidGlass className="p-8 md:p-10 bg-white/[0.01] border-white/5 mt-10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-[80px] pointer-events-none" />

                {success && (
                    <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                        <p className="text-emerald-400 text-sm font-semibold">Registration confirmed! You're in.</p>
                    </div>
                )}

                {isRegistered || success ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex items-center gap-3 px-6 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl w-fit">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            <span className="text-emerald-400 font-bold text-sm uppercase tracking-widest">Registered</span>
                        </div>
                        {myReg && <span className="text-white/40 text-xs font-semibold uppercase tracking-widest px-4 py-2 rounded-lg bg-white/5 border border-white/5">Status: {myReg.registrationStatus}</span>}
                    </div>
                ) : canRegister && !deadlinePassed && !showForm ? (
                    <div className="text-center sm:text-left">
                        <h4 className="text-xl font-bold text-white mb-2">Ready to Build?</h4>
                        <p className="text-sm text-white/50 mb-6">Secure your spot in this hackathon. Capacity is limited.</p>
                        <button onClick={() => setShowForm(true)} className="group px-8 py-4 rounded-xl bg-cyan-500 text-[#020202] font-bold text-sm uppercase tracking-widest hover:bg-cyan-400 transition-all duration-300 hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:-translate-y-0.5 w-full sm:w-auto">
                            Apply Now
                        </button>
                    </div>
                ) : isFull ? (
                    <div className="px-6 py-4 bg-rose-500/10 border border-rose-500/20 rounded-xl inline-flex items-center gap-3">
                        <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                        <span className="text-rose-400 font-bold text-sm uppercase tracking-widest">Capacity Reached</span>
                    </div>
                ) : (
                    <div className="px-6 py-4 bg-white/5 border border-white/10 rounded-xl inline-flex items-center gap-3">
                        <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        <span className="text-white/40 font-bold text-sm uppercase tracking-widest">Registration Closed</span>
                    </div>
                )}

                {showForm && (
                    <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pt-8 border-t border-white/5 relative z-10">

                        <StepProgress steps={REGISTRATION_STEPS} current={step} />

                        {/* Step 1: Personal Info */}
                        {step === 0 && (
                            <StepContainer title="Personal Information">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <FormInput label="First Name" required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John" />
                                    <FormInput label="Last Name" required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <FormInput label="Phone Number" required type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" />
                                    <FormInput label="Age" required type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="21" min={13} max={120} />
                                </div>
                                <FormChipSelect label="Gender" options={[...GENDERS]} value={gender} onChange={setGender} allowDeselect />
                            </StepContainer>
                        )}

                        {/* Step 2: Academic Info */}
                        {step === 1 && (
                            <StepContainer title="Academic Information">
                                <SearchableSelect label="School / University" required value={school} onChange={setSchool} options={SCHOOLS} placeholder="Start typing to search schools..." />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <SearchableSelect label="Major / Field of Study" required value={major} onChange={setMajor} options={MAJORS} placeholder="Start typing to search majors..." />
                                    <FormInput label="Graduation Year" required type="number" value={graduationYear} onChange={e => setGraduationYear(e.target.value)} placeholder="2026" min={2020} max={2035} />
                                </div>
                                <FormChipSelect label="Level of Study" required options={[...LEVELS_OF_STUDY]} value={levelOfStudy} onChange={setLevelOfStudy} />
                                <FormInput label="Country" required value={country} onChange={e => setCountry(e.target.value)} placeholder="United States" />
                            </StepContainer>
                        )}

                        {/* Step 3: Experience */}
                        {step === 2 && (
                            <StepContainer title="Experience & Links">
                                <FormInput label="How many hackathons have you attended?" type="number" value={hackathonsAttended} onChange={e => setHackathonsAttended(e.target.value)} placeholder="0" min={0} max={100} />
                                <FormTextarea label="Why do you want to attend?" value={whyAttend} onChange={e => setWhyAttend(e.target.value)} placeholder="Tell us what excites you about this hackathon..." maxLength={2000} rows={4} />
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                                    <FormInput label="Resume URL" type="url" value={resumeUrl} onChange={e => setResumeUrl(e.target.value)} placeholder="https://..." />
                                    <FormInput label="LinkedIn" type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." />
                                    <FormInput label="GitHub" type="url" value={githubUrl} onChange={e => setGithubUrl(e.target.value)} placeholder="https://github.com/..." />
                                </div>
                            </StepContainer>
                        )}

                        {/* Step 4: Logistics */}
                        {step === 3 && (
                            <StepContainer title="Logistics & Consent">
                                <FormChipSelect label="T-Shirt Size" options={[...SHIRT_SIZES]} value={shirtSize} onChange={(v) => setShirtSize(v as ShirtSize | '')} />
                                <FormMultiChipSelect label="Dietary Restrictions" options={[...DIETARY_OPTIONS]} selected={dietary} onChange={setDietary} noneOption="None" />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <FormInput label="Emergency Contact" value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)} placeholder="Full Name" />
                                    <FormInput label="Emergency Phone" type="tel" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} placeholder="(555) 123-4567" />
                                </div>
                                <div className="pt-4">
                                    <label className="flex items-start gap-3 cursor-pointer group">
                                        <input type="checkbox" checked={agreeToCoC} onChange={e => setAgreeToCoC(e.target.checked)}
                                            className="mt-1 w-5 h-5 rounded border-white/20 bg-[#0a0a0a] text-cyan-500 focus:ring-cyan-500/50 focus:ring-offset-0 cursor-pointer" />
                                        <span className="text-sm text-white/60 group-hover:text-white/80 transition-colors leading-relaxed">
                                            I agree to the <span className="text-cyan-400 font-semibold">Code of Conduct</span> and acknowledge that my information will be used for event organization purposes. *
                                        </span>
                                    </label>
                                </div>
                            </StepContainer>
                        )}

                        <FormErrorAlert message={error} />
                        <FormNavigation
                            step={step}
                            totalSteps={REGISTRATION_STEPS.length}
                            onBack={handleBack}
                            onNext={handleNext}
                            onSubmit={handleSubmit}
                            onCancel={() => { setShowForm(false); setError(''); setStep(0); }}
                            isSubmitting={registerMutation.isPending}
                        />
                    </div>
                )}
            </LiquidGlass>
        </div>
    );
}
