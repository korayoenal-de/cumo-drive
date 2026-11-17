/**
 * Neuigkeiten per E Mail an oder aus (Opt in, Koray 17.11.). Jede Änderung ist eine neue Zeile in consents,
 * der jüngste Eintrag gilt; so bleibt nachweisbar, wann zugestimmt oder widerrufen wurde.
 */
import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';

export function useNewsConsent(userId: string | undefined) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    void supabase.rpc('my_news_consent').then(({ data, error }) => {
      if (live && !error) setOn(data === true);
    });
    return () => {
      live = false;
    };
  }, [userId]);
  const set = useCallback(async (v: boolean) => {
    const before = on;
    setOn(v);
    const { error } = await supabase.rpc('set_news_consent', { granted: v });
    if (error) {
      setOn(before);
      throw new Error(error.message);
    }
  }, [on]);
  return { on, set };
}
