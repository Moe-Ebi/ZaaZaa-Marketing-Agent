import './load-env';
import { createClient } from '@supabase/supabase-js';

const auth = `Key ${process.env.HIGGSFIELD_KEY_ID!}:${process.env.HIGGSFIELD_API_SECRET!}`;
const BASE = 'https://platform.higgsfield.ai';
const headers = { Authorization: auth, 'Content-Type': 'application/json', 'User-Agent': 'higgsfield-server-js/2.0' };

async function post(path: string, params: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify({ params, ...extra }) });
    const t = await res.text();
    return `${res.status} ${t.slice(0, 180).replace(/\s+/g, ' ')}`;
  } catch (e) { return `ERR ${(e as Error).message}`; }
}

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: org } = await admin.from('organizations').select('id').eq('slug', 'zaazaa').single();
  const { data: p } = await admin.from('products').select('image_url').eq('organization_id', org!.id).not('image_url', 'is', null).limit(1).single();
  const img = p!.image_url as string;
  const ii = [{ type: 'image_url', image_url: img }];
  const base = { prompt: 'premium lifestyle product shot, cinematic', input_images: ii, aspect_ratio: '9:16' };

  console.log('valid body (baseline):       ', await post('/v1/text2image/nano-banana', base));
  console.log('trailing slash:              ', await post('/v1/text2image/nano-banana/', base));
  console.log('+quality standard:           ', await post('/v1/text2image/nano-banana', { ...base, quality: 'standard' }));
  console.log('+quality 1080p:              ', await post('/v1/text2image/nano-banana', { ...base, quality: '1080p' }));
  console.log('+model param (params):       ', await post('/v1/text2image/nano-banana', { ...base, model: 'nano-banana-pro' }));
  console.log('+model param (top):          ', await post('/v1/text2image/nano-banana', base, { model: 'nano-banana-pro' }));
  console.log('aspect 1:1:                  ', await post('/v1/text2image/nano-banana', { ...base, aspect_ratio: '1:1' }));
  console.log('+webhook null + seed:        ', await post('/v1/text2image/nano-banana', { ...base, seed: 42 }));
  console.log('no input_images (t2i):       ', await post('/v1/text2image/nano-banana', { prompt: 'x', aspect_ratio: '1:1' }));
}
main();
