import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createAdminClient();
    // Minimal connectivity check — just verifying we can reach Supabase
    const { error } = await supabase.from('_health_check_nonexistent').select('*').limit(1);

    // A "relation does not exist" error means we connected successfully
    const connected = !error || error.code === '42P01';

    return NextResponse.json({
      status: 'ok',
      supabase: connected ? 'connected' : 'error',
      supabaseError: connected ? undefined : error?.message,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: String(err) },
      { status: 500 },
    );
  }
}
