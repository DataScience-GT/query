'use client';

interface MemberStatus {
  isMember: boolean;
  isActive: boolean | null;
  memberType: string | null;
  expiresAt: Date | string | null;
  daysRemaining: number | null;
  renewalCount: number;
}

interface MemberData {
  id: string;
  firstName: string;
  lastName: string;
}

export default function MembershipCard({ memberStatus, memberData }: { memberStatus: MemberStatus | undefined, memberData: MemberData | null | undefined }) {
  if (!memberStatus?.isMember || !memberData) {
    return (
      <div className="bg-black/60 border border-amber-500/20 rounded-xl p-6 backdrop-blur-md">
        <h3 className="text-amber-500 font-bold uppercase tracking-tight text-sm mb-4">Membership_Status</h3>
        <p className="text-xs text-gray-400 mb-4 italic font-mono uppercase">Unregistered_Node</p>
        <button className="w-full py-3 border border-amber-500/30 text-amber-500 uppercase text-[10px] tracking-widest hover:bg-amber-500 hover:text-black transition-all">Authorize_Access</button>
      </div>
    );
  }

  const isActive = memberStatus.isActive === true;

  return (
    <div className="bg-black/60 border border-[#00A8A8]/20 rounded-xl p-6 backdrop-blur-md">
      <h3 className="text-[#00A8A8] font-bold uppercase tracking-tight text-sm mb-4">Membership_Status</h3>
      <div className="space-y-3 font-mono">
        <div className="flex justify-between items-center text-[10px]">
          <span className="text-gray-500 uppercase tracking-widest">Status</span>
          <span className={isActive ? 'text-green-500' : 'text-red-500'}>{isActive ? 'ACTIVE' : 'INACTIVE'}</span>
        </div>
        <div className="flex justify-between items-center text-[10px]">
          <span className="text-gray-500 uppercase tracking-widest">Days_Left</span>
          <span className="text-white font-bold">{memberStatus.daysRemaining ?? 0}</span>
        </div>
        {memberStatus.expiresAt && (
          <div className="pt-3 border-t border-white/5">
             <span className="text-gray-500 text-[9px] uppercase tracking-tighter">Term_End: {new Date(memberStatus.expiresAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}