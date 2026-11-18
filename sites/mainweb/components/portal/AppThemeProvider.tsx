"use client";

import { useEffect } from "react";
import type { ComponentProps, ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// next-themes writes the portal theme onto <html> (a `light` or `dark` class
// and an inline color-scheme) and leaves it there when the portal unmounts. A
// client-side move back to a marketing page, such as the browser's back button,
// then kept the portal's light ramp on the dark site until a reload. Clearing
// it on unmount hands those pages back their own dark default.
function ClearThemeOnLeave() {
  useEffect(
    () => () => {
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.style.removeProperty("color-scheme");
    },
    [],
  );
  return null;
}

export function AppThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider> & { children: ReactNode }) {
  return (
    <NextThemesProvider {...props}>
      <ClearThemeOnLeave />
      {children}
    </NextThemesProvider>
  );
}
