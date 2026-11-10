/** Push Benachrichtigungen gibt es nur in der App; im Web Planer tun diese Funktionen nichts. */
export type PushStatus = 'an' | 'aus' | 'offen' | 'nicht';

export function setOpenChat(_key: string | null) {}

export async function pushStatus(): Promise<PushStatus> {
  return 'nicht';
}

export async function enablePush(_ask: boolean): Promise<boolean> {
  return false;
}

export async function forgetPush() {}

export function PushHandler(_props: { userId: string | undefined }): null {
  return null;
}
