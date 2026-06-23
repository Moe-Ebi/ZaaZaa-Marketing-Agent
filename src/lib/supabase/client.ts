import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client (anon key + RLS). Uses @supabase/ssr so the session is stored
// in cookies, which lets middleware and server components read it.
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
