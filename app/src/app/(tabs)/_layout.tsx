import { Platform } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { InvitesBanner } from '@/components/group/invites-banner';

/**
 * Die vier Tabs der App. Der Web Planer unter /planer liegt außerhalb und nutzt die ganze Fläche.
 * Über den Tabs erscheinen offene Einladungen zu Gruppenfahrten.
 */
export default function TabsLayout() {
  return (
    <>
      <AppTabs />
      {Platform.OS !== 'web' && <InvitesBanner />}
    </>
  );
}
