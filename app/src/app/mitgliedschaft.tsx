/**
 * Mitgliedschaft freiwillig ansehen, etwa aus den Einstellungen. Wird im Root Stack als
 * fullScreenModal geführt.
 */
import { router } from 'expo-router';

import { Paywall } from '@/components/paywall/paywall';

export default function MitgliedschaftScreen() {
  return <Paywall mode="voluntary" onClose={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
}
