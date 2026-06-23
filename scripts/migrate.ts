// Applies SQL migrations in supabase/migrations/ in filename order.
// Tracks applied migrations in a _migrations table so re-runs are idempotent.
import './load-env';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { connect } from './db';

async function main() {
  const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = await connect();
  try {
    await client.query(`
      create table if not exists public._migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const { rows } = await client.query<{ name: string }>('select name from public._migrations');
    const applied = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`• skip  ${file} (already applied)`);
        continue;
      }
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      console.log(`▶ apply ${file}`);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into public._migrations (name) values ($1)', [file]);
        await client.query('commit');
        console.log(`✓ done  ${file}`);
      } catch (err) {
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    console.log('\nAll migrations applied.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\n✗ Migration failed:\n', err.message);
  process.exit(1);
});
