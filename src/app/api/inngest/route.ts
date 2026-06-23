import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { helloWorld } from '@/lib/inngest/functions/hello-world';
import { refreshCredentials } from '@/lib/inngest/functions/refresh-credentials';
import { syncWooCommerceProducts } from '@/lib/inngest/functions/sync-woocommerce-products';
import { generateContent } from '@/lib/inngest/functions/generate-content';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [helloWorld, refreshCredentials, syncWooCommerceProducts, generateContent],
});
