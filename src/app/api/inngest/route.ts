import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { helloWorld } from '@/lib/inngest/functions/hello-world';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [helloWorld],
});
