import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side admin client (bypasses RLS — only for trusted server/operator code
// and background jobs). Never use this to serve tenant data to a user; it ignores
// RLS scoping. Lives in its own module (no next/headers import) so scripts and
// Inngest functions can use it outside a request context.
export function createAdminClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
