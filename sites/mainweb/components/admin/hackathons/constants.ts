export type HackathonStatus = 'draft' | 'open' | 'closed' | 'in_progress' | 'completed' | 'cancelled';

export const STATUSES: { value: HackathonStatus; label: string; color: string; bg: string; border: string }[] = [
    { value: 'draft', label: 'Draft', color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20' },
    { value: 'open', label: 'Open', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
    { value: 'closed', label: 'Closed', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
    { value: 'in_progress', label: 'In Progress', color: 'text-[#EAFF2B]', bg: 'bg-[#EAFF2B]/10', border: 'border-[#EAFF2B]/20' },
    { value: 'completed', label: 'Completed', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { value: 'cancelled', label: 'Cancelled', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
];

export function getStatusMeta(s: string) {
    const status = STATUSES.find((x) => x.value === s);
    if (!status) return STATUSES[0];
    return status;
}

export function toInputDate(d: Date | string) {
    const dt = new Date(d);
    return dt.toISOString().slice(0, 16);
}
