/** Konto anlegen im Browser, erreichbar über den Kopf der Landingpage. */
import { WebAuth } from '@/components/auth/web-auth';

export default function Registrieren() {
  return <WebAuth mode="register" />;
}
