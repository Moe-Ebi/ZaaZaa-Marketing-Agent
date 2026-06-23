import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createAdminClient();
    // Minimal connectivity check — just verifying we can reach Supabase
    // Any response from Supabase (even an error about missing tables) means we're connected.
    // A true connection failure throws an exception caught below.
    await supabase.from('_health_check_nonexistent').select('*').limit(1);

    return NextResponse.json({
      status: 'ok',
      supabase: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: String(err) },
      { status: 500 },
    );
  }
}
