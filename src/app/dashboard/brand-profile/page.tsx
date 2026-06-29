import { redirect } from 'next/navigation';

// Superseded by the comprehensive Brand customization center (Phase 2).
export default function BrandProfileRedirect() {
  redirect('/dashboard/brand');
}
