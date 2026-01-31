import Image from 'next/image';

interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface Member {
  firstName: string;
  lastName: string;
  memberType: string | null;
}

interface ProfileHeaderProps {
  user: User;
  member?: Member | null;
}

export default function ProfileHeader({ user, member }: ProfileHeaderProps) {
  return (
    <div className="bg-black/60 border border-white/5 rounded-xl p-8 backdrop-blur-md">
      <div className="flex items-start gap-6">
        <div className="relative group">
          <div className="absolute -inset-2 bg-[#00A8A8]/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <Image
            src={user.image || '/avatar-placeholder.png'}
            alt="Profile"
            width={96}
            height={96}
            className="relative rounded-full border-2 border-[#00A8A8]/30 grayscale hover:grayscale-0 transition-all object-cover"
          />
        </div>

        <div className="flex-1">
          <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">
            {member ? `${member.firstName} ${member.lastName}` : user.name || 'Unknown User'}
          </h2>
          <p className="text-[#00A8A8] text-xs uppercase tracking-widest mt-1">
            {user.email}
          </p>
          {member && (
            <div className="mt-4 inline-block px-4 py-2 bg-[#00A8A8]/10 border border-[#00A8A8]/30 rounded">
              <p className="text-[#00A8A8] text-[10px] uppercase tracking-widest font-bold">
                Member_Type: {member.memberType || 'Standard'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}