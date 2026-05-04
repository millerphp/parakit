/**
 * Single source of truth for the user-facing app version string.
 *
 * Keep this in sync with:
 * - `package.json` "version"
 * - `android/app/build.gradle` versionName (and bump versionCode for each release)
 *
 * Used by the About page UI and the BackupService manifest header.
 */
export const APP_VERSION = '1.0.0';
