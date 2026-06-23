import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Re-export the admin client so existing imports keep working. The actual
// implementation lives in ./admin (no next/headers dependency).
export { createAdminClient } from './admin';

// Cookie-bound server client (anon key). Carries the user's session so every
// query runs UNDER RLS as that user — this is what tenant-scoped reads use.
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // In Server Components cookie writes are not allowed; ignore them.
        // Middleware / route handlers / server actions can refresh sessions.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* called from a Server Component — safe to ignore */
        }
      },
    },
  });
}
