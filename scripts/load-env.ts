// Loads .env.local into process.env with OVERRIDE semantics.
//
// Why override: Node's --env-file and Next.js both REFUSE to overwrite a
// variable that already exists in the real OS environment. A stray machine-level
// var (e.g. a SUPABASE_URL left over from another project) would then silently
// redirect these operator scripts to the wrong database. We must not let that
// happen for DDL/seed scripts, so .env.local always wins here.
//
// Import this FIRST in every operator script:  import './load-env';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const path = join(process.cwd(), '.env.local');
const content = readFileSync(path, 'utf8');

for (const rawLine of content.split('\n')) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq === -1) continue;
  const key = line.slice(0, eq).trim();
  let val = line.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  process.env[key] = val;
}
