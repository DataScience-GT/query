"use client";

import { useQuery } from "@tanstack/react-query";
import { SCHOOLS } from "@/components/hackathon/constants";

async function fetchSchools(): Promise<string[]> {
  const res = await fetch("/schools.json");
  if (!res.ok) throw new Error(res.statusText);
  const list: unknown = await res.json();
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("No schools in the list");
  }
  return list as string[];
}

/**
 * The schools to suggest. The full list is 12k schools / ~450KB, so it loads
 * once the academic step opens (`enabled`) rather than with the form. Until it
 * arrives, and if it never does, the short list stands in and still works.
 */
export function useSchoolOptions(enabled: boolean): readonly string[] {
  const { data } = useQuery({
    queryKey: ["schools"],
    queryFn: fetchSchools,
    enabled,
    staleTime: Infinity,
    retry: false,
  });
  return data ?? SCHOOLS;
}
