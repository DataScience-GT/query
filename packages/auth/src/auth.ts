import NextAuth from "next-auth";
import { authConfig } from "./config";
import { adapter } from "./adapter";

// If no adapter (no database), fall back to JWT sessions
const sessionConfig = adapter
  ? authConfig.session
  : { strategy: "jwt" as const };

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter,
  session: sessionConfig,
});