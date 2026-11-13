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
import { useEffect, useSyncExternalStore } from 'react';

import { SUPABASE_URL, supabase } from './supabase';

const SIZE = 512;
const MAX_BYTES = 1024 * 1024;

type Entry = number | null;
const known = new Map<string, Entry>();
/** Wann eine Fassung zuletzt geholt wurde: nach FRESH_MS fragt der nächste Kreis neu nach (Koray 13.11.: in den
 * Einstellungen blieben nach dem Hochladen die Initialen stehen, weil dort noch "kein Foto" gemerkt war) */
const fetchedAt = new Map<string, number>();
const FRESH_MS = 2 * 60 * 1000;
const listeners = new Set<() => void>();
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function queue(id: string, force = false) {
  const at = fetchedAt.get(id);
  if (pending.has(id) || (!force && known.has(id) && at != null && Date.now() - at < FRESH_MS)) return;
  pending.add(id);
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    const all = [...pending];
    pending = new Set();
    // Nur echte Konten abfragen: eine fremde Kennung im selben Aufruf ließ früher die ganze Abfrage scheitern
    const ids = all.filter((id) => UUID.test(id));
    for (const id of all) if (!UUID.test(id)) known.set(id, null);
    for (let i = 0; i < ids.length; i += 100) {
      const part = ids.slice(i, i + 100);
      try {
        const { data, error } = await supabase.from('profiles').select('id,avatar_v').in('id', part);
        if (error) throw error;
        const now = Date.now();
        const rows = (data ?? []) as { id: string; avatar_v: number | null }[];
        for (const id of part) {
          known.set(id, rows.find((r) => r.id === id)?.avatar_v ?? null);
          fetchedAt.set(id, now);
        }
      } catch {
        // Fehler nicht als "kein Foto" merken: beim nächsten Kreis erneut fragen
        for (const id of part) if (!known.has(id)) known.set(id, null);
      }
    }
    emit();
    void healOwn(ids);
  }, 60);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Eigenes Foto liegt im Speicher, aber die Fassung fehlt im Profil (Koray 13.11.: Foto hochgeladen, aber nirgends
 * zu sehen): einmal je Sitzung nachsehen und die Fassung nachtragen, damit es auch die anderen sehen.
 */
let healed = false;
async function healOwn(ids: string[]) {
  if (healed) return;
  try {
    const { data: u } = await supabase.auth.getUser();
    const me = u.user?.id;
    if (!me || !ids.includes(me) || known.get(me) != null) return;
    healed = true;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/public/avatars/${me}.jpg`, { method: 'HEAD' });
    if (!r.ok) return;
    const v = Math.floor(Date.now() / 1000);
    // auch wenn das Nachtragen scheitert: das eigene Foto zeigen wir, es liegt ja im Speicher
    await supabase.from('profiles').update({ avatar_v: v }).eq('id', me);
    known.set(me, v);
    fetchedAt.set(me, Date.now());
    emit();
  } catch {
    // beim nächsten Start wieder
  }
}

export function avatarUrl(userId: string, v: number): string {
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${userId}.jpg?v=${v}`;
}

/** Adresse des Fotos oder null (kein Foto oder noch unbekannt) */
/** Gerade hochgeladenes eigenes Foto als Datei auf dem Gerät: sofort sichtbar, ohne erst herunterzuladen */
const localFile = new Map<string, string>();

function snapshot(userId: string | null | undefined): string | null {
  if (!userId) return null;
  const local = localFile.get(userId);
  if (local) return local;
  const v = known.get(userId);
  return v != null ? avatarUrl(userId, v) : null;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/**
 * Adresse des Fotos oder null. Über useSyncExternalStore (Koray 13.11.: neue Fotos erschienen erst nach dem
 * Verlassen der Seite; der React Compiler hatte das Lesen aus dem Zwischenspeicher eingefroren).
 */
export function useAvatar(userId: string | null | undefined): string | null {
  useEffect(() => {
    if (userId) queue(userId);
  }, [userId]);
  return useSyncExternalStore(
    subscribe,
    () => snapshot(userId),
    () => snapshot(userId),
  );
}

function manipulator(): typeof import('expo-image-manipulator') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-image-manipulator') as typeof import('expo-image-manipulator');
  } catch {
    return null;
  }
}

/** Kann die App selbst zuschneiden (expo-image-manipulator ab Build 28)? Sonst schneidet iOS quadratisch zu. */
export function canCrop(): boolean {
  const m = manipulator();
  return !!m?.ImageManipulator;
}

/** Ausschnitt in Bildpixeln */
export type Crop = { originX: number; originY: number; width: number; height: number };

/** Zuschneiden (wenn gewählt) und auf 512 Pixel verkleinern, wenn das Modul im Build ist, sonst null */
async function shrink(uri: string, crop?: Crop): Promise<string | null> {
  const m = manipulator();
  if (!m) return null;
  try {
    const ctx = m.ImageManipulator.manipulate(uri);
    if (crop) ctx.crop(crop);
    ctx.resize({ width: SIZE, height: SIZE });
    const img = await ctx.renderAsync();
    const out = await img.saveAsync({ format: m.SaveFormat.JPEG, compress: 0.82 });
    return out.uri;
  } catch {
    return null;
  }
}

export type PickResult = { ok: true } | { ok: false; cancelled?: boolean; message?: string };
export type Picked = { uri: string; width: number; height: number };

/**
 * Foto wählen oder aufnehmen. Mit eigenem Zuschnitt (canCrop) kommt das ganze Bild zurück und der Kreis
 * im Profil legt den Ausschnitt fest (Koray 13.11.: reinzoomen und verschieben in der Kreismaske);
 * ältere Builds lassen iOS quadratisch zuschneiden.
 */
export async function pickPhoto(source: 'library' | 'camera'): Promise<Picked | PickResult> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, message: 'Melde dich an, um ein Foto zu setzen.' };
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { ok: false, message: source === 'camera' ? 'Ohne Zugriff auf die Kamera geht es nicht. Du kannst ihn in den iPhone Einstellungen erlauben.' : 'Ohne Zugriff auf deine Fotos geht es nicht. Du kannst ihn in den iPhone Einstellungen erlauben.' };
  const own = canCrop();
  // Mit eigenem Zuschnitt rechnet iOS das Foto nicht erst um (HEIC zu JPEG, Kompression): das dauerte bei großen
  // Fotos mehrere Sekunden (Koray 13.11.); verkleinert wird danach ohnehin auf 512 Pixel
  const opts: ImagePicker.ImagePickerOptions = own
    ? { mediaTypes: ['images'], allowsEditing: false, quality: 1, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current }
    : { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync({ ...opts, cameraType: ImagePicker.CameraType.front }) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return { ok: false, cancelled: true };
  const a = res.assets[0];
  return { uri: a.uri, width: a.width, height: a.height };
}

/** Zuschneiden, verkleinern, hochladen und die Fassung erhöhen */
export async function uploadAvatar(uri: string, crop?: Crop): Promise<PickResult> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, message: 'Melde dich an, um ein Foto zu setzen.' };
  const small = (await shrink(uri, crop)) ?? uri;
  const bytes = await new File(small).bytes();
  if (bytes.byteLength > MAX_BYTES) return { ok: false, message: 'Das Foto ist zu groß. Mit dem nächsten App Update wird es automatisch verkleinert.' };
  const { error } = await supabase.storage.from('avatars').upload(`${u.user.id}.jpg`, bytes, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
  if (error) return { ok: false, message: 'Das Foto ließ sich nicht hochladen. Versuch es gleich noch einmal.' };
  const v = Math.floor(Date.now() / 1000);
  const { error: e2 } = await supabase.from('profiles').update({ avatar_v: v }).eq('id', u.user.id);
  if (e2) return { ok: false, message: 'Das Foto ist hochgeladen, aber noch nicht gespeichert. Versuch es gleich noch einmal.' };
  known.set(u.user.id, v);
  fetchedAt.set(u.user.id, Date.now());
  localFile.set(u.user.id, small);
  emit();
  return { ok: true };
}

/** Eigenes Foto neu holen, etwa wenn die Einstellungen in den Vordergrund kommen */
export function refreshAvatar(userId: string) {
  queue(userId, true);
}

export async function removeAvatar(): Promise<PickResult> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false };
  const { error } = await supabase.from('profiles').update({ avatar_v: null }).eq('id', u.user.id);
  if (error) return { ok: false, message: 'Das Foto ließ sich nicht entfernen.' };
  await supabase.storage.from('avatars').remove([`${u.user.id}.jpg`]).catch(() => undefined);
  known.set(u.user.id, null);
  localFile.delete(u.user.id);
  fetchedAt.set(u.user.id, Date.now());
  emit();
  return { ok: true };
}
