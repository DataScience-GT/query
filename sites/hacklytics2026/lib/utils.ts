import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combine class names and merge Tailwind utilities
 * Works like clsx + merges Tailwind intelligently
 */
export function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(...inputs));
}
