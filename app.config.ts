import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withEntitlementsPlist, type ConfigPlugin } from 'expo/config-plugins';

const withoutPush: ConfigPlugin = (config) => withEntitlementsPlist(config, (mod) => {
  delete mod.modResults['aps-environment'];
  return mod;
});

/**
 * app.json, plus what a fork needs to build and ship its own copy.
 *
 * The bundle id in app.json belongs to the App Store listing, and Apple makes
 * bundle ids unique across teams, so a fork cannot sign it. Rather than edit
 * app.json (and carry that edit through every merge from upstream), these
 * values come from the environment and leave app.json untouched:
 *
 *   HERDRCHAT_BUNDLE_ID   the fork's own bundle id (iOS) and package (Android)
 *   APPLE_TEAM_ID         the Apple team that signs it
 *   EAS_PROJECT_ID        the EAS project, for over-the-air updates
 *
 * With none of them set the config is exactly app.json, so upstream builds are
 * unchanged. A fork sources scripts/ota.env before building.
 *
 * A fork also drops the push entitlement: the relay sends only to the App
 * Store bundle id, so the capability would buy nothing, and unregistered with
 * Apple for the fork's id it keeps automatic signing from making a profile.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const bundleId = process.env.HERDRCHAT_BUNDLE_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const projectId = process.env.EAS_PROJECT_ID;
  const expo: ExpoConfig = { ...config, name: config.name ?? 'HerdrChat', slug: config.slug ?? 'herdrchat' };

  if (bundleId) {
    // Push stays with the App Store app: the relay sends only to its bundle
    // id, so a fork's entitlement would buy nothing and, unregistered with
    // Apple for the fork's id, it stops automatic signing from producing a
    // profile at all.
    expo.ios = { ...expo.ios, bundleIdentifier: bundleId };
    expo.android = { ...expo.android, package: bundleId.toLowerCase() };
  }
  if (teamId) expo.ios = { ...expo.ios, appleTeamId: teamId };
  if (projectId) {
    expo.extra = { ...expo.extra, eas: { ...(expo.extra?.eas as object | undefined), projectId } };
    // Updates follow the native fingerprint: a JS-only change ships over the
    // air to every build with the same native code; a native change does not
    // reach builds that cannot run it.
    expo.updates = { url: `https://u.expo.dev/${projectId}`, checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0 };
    expo.runtimeVersion = { policy: 'fingerprint' };
  }
  // Applied here, ahead of app.json's plugins, so its edit lands last:
  // expo-notifications' plugin would otherwise put the entitlement back.
  return bundleId ? (withoutPush(expo) as ExpoConfig) : expo;
};
