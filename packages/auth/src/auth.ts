import NextAuth from "next-auth";
import { authConfig } from "./config";
import { adapter } from "./adapter";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter,
});