/**
 * Profilfotos (Koray 13.11.): ein quadratisches JPEG je Konto unter avatars/<id>.jpg, öffentlich lesbar.
 * Ob jemand ein Foto hat, steht in profiles.avatar_v (Fassung, null heißt keins). Die Kreise in Chat, Drivers,
 * Ausfahrten und Karte fragen die Fassungen gesammelt ab (alle 60 ms ein Aufruf für alle neuen Konten).
 *
 * Hochladen: Foto wählen oder aufnehmen, auf iOS quadratisch zuschneiden, auf 512 Pixel verkleinern
 * (expo-image-manipulator, ab Build 28). Ältere Builds ohne das Modul laden das zugeschnittene Foto mit
 * stärkerer Kompression hoch, solange es unter 1 MB bleibt.
 */
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';

import { SUPABASE_URL, supabase } from './supabase';

const SIZE = 512;
const MAX_BYTES = 1024 * 1024;

type Entry = number | null;
const known = new Map<string, Entry>();
const listeners = new Set<() => void>();
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function queue(id: string) {
  if (known.has(id) || pending.has(id)) return;
  pending.add(id);
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    const ids = [...pending];
    pending = new Set();
    try {
      const { data } = await supabase.from('profiles').select('id,avatar_v').in('id', ids);
      for (const id of ids) known.set(id, null);
      for (const r of (data ?? []) as { id: string; avatar_v: number | null }[]) known.set(r.id, r.avatar_v ?? null);
    } catch {
      for (const id of ids) known.set(id, null);
    }
    emit();
  }, 60);
}

export function avatarUrl(userId: string, v: number): string {
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${userId}.jpg?v=${v}`;
}

/** Adresse des Fotos oder null (kein Foto oder noch unbekannt) */
export function useAvatar(userId: string | null | undefined): string | null {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    if (userId) queue(userId);
    return () => {
      listeners.delete(l);
    };
  }, [userId]);
  if (!userId) return null;
  const v = known.get(userId);
  return v != null ? avatarUrl(userId, v) : null;
}

/** Verkleinern, wenn das Modul im Build ist (ab Build 28), sonst null */
async function shrink(uri: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    const ctx = m.ImageManipulator.manipulate(uri);
    ctx.resize({ width: SIZE, height: SIZE });
    const img = await ctx.renderAsync();
    const out = await img.saveAsync({ format: m.SaveFormat.JPEG, compress: 0.82 });
    return out.uri;
  } catch {
    return null;
  }
}

export type PickResult = { ok: true } | { ok: false; cancelled?: boolean; message?: string };

/** Foto wählen (Mediathek) oder aufnehmen, verkleinern, hochladen und die Fassung erhöhen */
export async function pickAvatar(source: 'library' | 'camera'): Promise<PickResult> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, message: 'Melde dich an, um ein Foto zu setzen.' };
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { ok: false, message: source === 'camera' ? 'Ohne Zugriff auf die Kamera geht es nicht. Du kannst ihn in den iPhone Einstellungen erlauben.' : 'Ohne Zugriff auf deine Fotos geht es nicht. Du kannst ihn in den iPhone Einstellungen erlauben.' };
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync({ ...opts, cameraType: ImagePicker.CameraType.front }) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return { ok: false, cancelled: true };
  const picked = res.assets[0].uri;
  const small = (await shrink(picked)) ?? picked;
  const bytes = await new File(small).bytes();
  if (bytes.byteLength > MAX_BYTES) return { ok: false, message: 'Das Foto ist zu groß. Mit dem nächsten App Update wird es automatisch verkleinert.' };
  const { error } = await supabase.storage.from('avatars').upload(`${u.user.id}.jpg`, bytes, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
  if (error) return { ok: false, message: 'Das Foto ließ sich nicht hochladen. Versuch es gleich noch einmal.' };
  const v = Math.floor(Date.now() / 1000);
  const { error: e2 } = await supabase.from('profiles').update({ avatar_v: v }).eq('id', u.user.id);
  if (e2) return { ok: false, message: 'Das Foto ist hochgeladen, aber noch nicht gespeichert. Versuch es gleich noch einmal.' };
  known.set(u.user.id, v);
  emit();
  return { ok: true };
}

export async function removeAvatar(): Promise<PickResult> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false };
  const { error } = await supabase.from('profiles').update({ avatar_v: null }).eq('id', u.user.id);
  if (error) return { ok: false, message: 'Das Foto ließ sich nicht entfernen.' };
  await supabase.storage.from('avatars').remove([`${u.user.id}.jpg`]).catch(() => undefined);
  known.set(u.user.id, null);
  emit();
  return { ok: true };
}
