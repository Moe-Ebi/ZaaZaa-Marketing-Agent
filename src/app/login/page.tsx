import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { LoginForm } from './LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: redirectParam } = await searchParams;
  const dest = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/dashboard';

  const ctx = await getTenantContext();
  if (ctx) redirect(dest);

  return <LoginForm redirectTo={dest} />;
}
