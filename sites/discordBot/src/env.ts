import dotenv from "dotenv";
import { z } from "zod/v4";

dotenv.config();

const envSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  GUILD_ID: z.string().min(1),
  ROLE_ANNOUNCEMENTS_ID: z.string().min(1),
  ROLE_WORKSHOPS_ID: z.string().min(1),
  ROLE_SPONSORS_ID: z.string().min(1),
  ROLE_FOOD_ID: z.string().min(1),
  NOTION_TOKEN: z.string().min(1),
  NOTION_GUIDE_PAGE_ID: z.string().min(1),
});

export const env = envSchema.parse(process.env);
