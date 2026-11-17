/**
 * Web: wie in der App (routing-auth.ts) schickt der Web Planer das Supabase Token an die eigenen Server.
 * Erst einspielen, wenn die Server die CORS Vorabfrage mit Authorization beantworten (routing/server/cloud/auth).
 */
export { routingHeaders, startRoutingAuth } from './routing-auth';
