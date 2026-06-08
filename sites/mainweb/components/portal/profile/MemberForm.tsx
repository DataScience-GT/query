'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import SkillsInterestsInput from '@/components/portal/profile/SkillsInterestsInput';

interface Member {
  firstName: string; lastName: string; phoneNumber: string | null;
  school: string | null; major: string | null; graduationYear: number | null;
  skills: string[] | null; linkedinUrl: string | null; githubUrl: string | null;
}

export default function MemberForm({ member }: { member: Member | null | undefined }) {
  const utils = trpc.useUtils();
  const [firstName, setFirstName] = useState(member?.firstName || '');
  const [lastName, setLastName] = useState(member?.lastName || '');
  const [phone, setPhone] = useState(member?.phoneNumber || '');
  const [school, setSchool] = useState(member?.school || '');
  const [major, _setMajor] = useState(member?.major || '');
  const [gradYear, setGradYear] = useState(member?.graduationYear?.toString() || '');
  const [skills, setSkills] = useState<string[]>(member?.skills || []);
  const [linkedin, setLinkedin] = useState(member?.linkedinUrl || '');
  const [github, setGithub] = useState(member?.githubUrl || '');

  const updateMember = trpc.member.update.useMutation({
    onSuccess: () => {
      utils.member.me.invalidate();
      utils.member.checkStatus.invalidate();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMember.mutate({
      firstName, lastName, phoneNumber: phone, school, major,
      graduationYear: gradYear ? parseInt(gradYear) : undefined,
      skills, linkedinUrl: linkedin, githubUrl: github
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[9px] uppercase tracking-widest text-gray-500">Legal_First_Name</label>
          <input value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded p-3 text-sm text-white outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] uppercase tracking-widest text-gray-500">Legal_Last_Name</label>
          <input value={lastName} onChange={e => setLastName(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded p-3 text-sm text-white outline-none" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[9px] uppercase tracking-widest text-gray-500">Contact_Phone_Node</label>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (000) 000-0000" className="w-full bg-black/40 border border-white/10 rounded p-3 text-sm text-white outline-none" />
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
        <div className="space-y-1">
          <label className="text-[9px] uppercase tracking-widest text-gray-500">LinkedIn_URL</label>
          <input value={linkedin} onChange={e => setLinkedin(e.target.value)} placeholder="linkedin.com/in/..." className="w-full bg-black/40 border border-white/10 rounded p-3 text-sm text-white outline-none focus:border-[#EAFF2B]/30" />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] uppercase tracking-widest text-gray-500">GitHub_URL</label>
          <input value={github} onChange={e => setGithub(e.target.value)} placeholder="github.com/..." className="w-full bg-black/40 border border-white/10 rounded p-3 text-sm text-white outline-none focus:border-[#EAFF2B]/30" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-1">
          <label className="text-[9px] uppercase tracking-widest text-gray-500">University</label>
          <input value={school} onChange={e => setSchool(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded p-3 text-sm text-white outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] uppercase tracking-widest text-gray-500">Class_Year</label>
          <input type="number" value={gradYear} onChange={e => setGradYear(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded p-3 text-sm text-white outline-none" />
        </div>
      </div>

      <div>
        <label className="text-[9px] text-gray-500 uppercase mb-2 block tracking-[0.2em]">Skill_Registry</label>
        <SkillsInterestsInput items={skills} setItems={setSkills} placeholder="Add_New_Skill" maxItems={8} accentColor="[#EAFF2B]" />
      </div>

      <button type="submit" disabled={updateMember.isPending} className="w-full py-4 bg-[#EAFF2B] text-white uppercase font-black text-[10px] tracking-widest transition-all shadow-[4px_4px_0_0_#EAFF2B]">
        {updateMember.isPending ? 'Syncing_Advanced_Data...' : 'Commit_Reconfiguration'}
      </button>
    </form>
  );
}