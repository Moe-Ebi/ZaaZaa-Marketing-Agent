// Shared Postgres connection helper for migration + seed + test scripts.
// Connects directly to the Supabase Postgres instance using the project
// password. DDL (tables, policies, triggers) cannot run over the REST API,
// so these operator scripts use a direct connection.
import { Client, type ClientConfig } from 'pg';

function projectRef(): string {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const match = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (!match) throw new Error(`Could not parse project ref from SUPABASE_URL="${url}"`);
  return match[1];
}

// Candidate connections, tried in order. Direct (IPv6/IPv4 depending on
// project), then the session-mode pooler as a fallback. If you know your
// region, set SUPABASE_DB_HOST to skip the guessing.
export function connectionCandidates(): ClientConfig[] {
  const ref = projectRef();
  const password = process.env.SUPABASE_PROJECT_PASSWORD;
  if (!password) throw new Error('SUPABASE_PROJECT_PASSWORD is not set');

  const ssl = { rejectUnauthorized: false };

  if (process.env.SUPABASE_DB_HOST) {
    return [
      {
        host: process.env.SUPABASE_DB_HOST,
        port: Number(process.env.SUPABASE_DB_PORT ?? 5432),
        user: process.env.SUPABASE_DB_USER ?? `postgres.${ref}`,
        password,
        database: 'postgres',
        ssl,
      },
    ];
  }

  const candidates: ClientConfig[] = [
    // Direct connection
    {
      host: `db.${ref}.supabase.co`,
      port: 5432,
      user: 'postgres',
      password,
      database: 'postgres',
      ssl,
    },
  ];

  // Session-mode pooler. Hostname prefix is aws-0- (older projects) or
  // aws-1- (newer projects); region is unknown, so try a wide set. The pooler
  // fast-rejects an unknown tenant, so wrong guesses fail quickly.
  const prefixes = ['aws-0', 'aws-1'];
  const regions = [
    'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-central-2', 'eu-north-1',
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1', 'sa-east-1',
    'ap-southeast-1', 'ap-southeast-2', 'ap-south-1', 'ap-northeast-1', 'ap-northeast-2',
  ];
  for (const prefix of prefixes) {
    for (const region of regions) {
      candidates.push({
        host: `${prefix}-${region}.pooler.supabase.com`,
        port: 5432,
        user: `postgres.${ref}`,
        password,
        database: 'postgres',
        ssl,
      });
    }
  }
  return candidates;
}

export async function connect(): Promise<Client> {
  let lastErr: unknown;
  for (const cfg of connectionCandidates()) {
    const client = new Client({ ...cfg, connectionTimeoutMillis: 6000 });
    try {
      await client.connect();
      const label = `${cfg.host}:${cfg.port} as ${cfg.user}`;
      console.log(`✓ Connected: ${label}`);
      return client;
    } catch (err) {
      lastErr = err;
      await client.end().catch(() => {});
      console.log(`  …could not connect via ${cfg.host}:${cfg.port} (${(err as Error).message})`);
    }
  }
  throw new Error(
    `Could not connect to Supabase Postgres. Last error: ${(lastErr as Error)?.message}\n` +
    `Set SUPABASE_DB_HOST (and SUPABASE_DB_PORT/USER) in .env.local from your ` +
    `Supabase dashboard → Project Settings → Database → Connection string.`,
  );
}
