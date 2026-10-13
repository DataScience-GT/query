"use client";

import { useEffect, useState } from "react";

/** A value that settles `ms` after it stops changing, so typing into a search
 *  box sends one query rather than one per keystroke. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
