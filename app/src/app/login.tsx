/** Login im Browser, erreichbar über den Kopf der Landingpage. */
import { WebAuth } from '@/components/auth/web-auth';

export default function Login() {
  return <WebAuth mode="login" />;
}
