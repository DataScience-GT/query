import { useQuery } from '@tanstack/react-query';

export function fetchSession() {
  return fetch('/api/auth/me').then(r => r.json()).then((j) => j.user ?? null);
}

export function useSession() {
  return useQuery({ queryKey: ['session'], queryFn: fetchSession, staleTime: 1000 * 60 * 1 });
}

export default useSession;
