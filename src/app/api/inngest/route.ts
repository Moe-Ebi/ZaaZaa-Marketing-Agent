import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { helloWorld } from '@/lib/inngest/functions/hello-world';
import { refreshCredentials } from '@/lib/inngest/functions/refresh-credentials';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [helloWorld, refreshCredentials],
});
