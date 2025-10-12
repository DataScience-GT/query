export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          school: string | null;
          major: string | null;
          level_of_study: string | null;
          graduation_year: string | null;
          github: string | null;
          linkedin: string | null;
          shirt_size: string | null;
          dietary_restrictions: string | null;
          skills: string | null;
          resume_url: string | null;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          school?: string | null;
          major?: string | null;
          level_of_study?: string | null;
          graduation_year?: string | null;
          github?: string | null;
          linkedin?: string | null;
          shirt_size?: string | null;
          dietary_restrictions?: string | null;
          skills?: string | null;
          resume_url?: string | null;
        };
        Update: {
          full_name?: string | null;
          school?: string | null;
          major?: string | null;
          level_of_study?: string | null;
          graduation_year?: string | null;
          github?: string | null;
          linkedin?: string | null;
          shirt_size?: string | null;
          dietary_restrictions?: string | null;
          skills?: string | null;
          resume_url?: string | null;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
}
