import { Redirect } from 'expo-router';

import Planner from '@/components/planner/planner.web';
import { useAuthReady, useSession } from '@/lib/auth';

/** Vollflächiger Web Planer unter /planer (Desktop), nur mit Konto. */
export default function PlanerSeite() {
  const session = useSession();
  const ready = useAuthReady();
  if (!ready) return null;
  if (!session) return <Redirect href="/login" />;
  return <Planner />;
}
