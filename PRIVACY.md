# ParaKit: Investigation Toolkit Privacy Policy

_Last updated: 2026-05-02_

ParaKit: Investigation Toolkit ("the app") is a personal investigation logging tool. This page describes what data the app collects, how it's used, and how it's stored.

## Summary

**No data leaves your device.** The app does not transmit any personal data, evidence, audio, photos, video, or location information to any server controlled by us or by anyone else.

## What data the app accesses

ParaKit: Investigation Toolkit accesses the following on-device sensors and APIs:

| Data | Why | Where it goes |
|---|---|---|
| **Approximate / precise location** (GPS) | To stamp each investigation with a location for later reference. | Stored on your device. Used to fetch outdoor weather conditions from open-meteo.com (lat/lon only — no identifying info). |
| **Microphone** | To record audio for EVP review. | Saved to the app's private storage on your device. Never transmitted. |
| **Camera** | To capture still photos and video as investigation evidence. | Saved to the app's private storage on your device. Never transmitted. |
| **Magnetometer** | To measure ambient magnetic field for EMF readings. | Stored as numeric readings on your device. |
| **Accelerometer (linear acceleration)** | To detect surface vibrations. | Stored as numeric readings on your device. |
| **Internet** | One outbound request per investigation start, to open-meteo.com, to fetch current weather conditions for the captured GPS coordinates. open-meteo's privacy policy applies to that single request. | No personal identifiers are sent — only latitude and longitude, which are also visible in the app. |

## What is stored, and where

All investigation data — the location title, reason, environmental readings, evidence files (photos, videos, audio recordings, magnetometer/accelerometer readings, field notes) — is stored exclusively on your device:

- **Investigation metadata** (titles, notes, reasons, environmental snapshots, evidence index): browser-style local storage tied to the app.
- **Audio recordings, photos, and video**: the app's private filesystem area (`/data/data/tech.christophermiller.parakit/files/`), accessible only to ParaKit: Investigation Toolkit.

You can use the in-app **Download** action to save copies of investigations or individual evidence to your phone's general storage (e.g. `Downloads` folder) for backup or sharing. Data you choose to export this way leaves the app's sandbox; what happens to it after that is up to you.

## What we do *not* collect

- No accounts, sign-ups, or logins.
- No analytics, tracking pixels, or third-party SDKs.
- No advertising identifiers.
- No usage telemetry sent to us.
- No crash reports sent to us.

## Permissions you'll be asked for

When you first use a sensor or evidence-capture tool, Android will ask you to grant the relevant permission. You can revoke these at any time via:

**Settings → Apps → ParaKit: Investigation Toolkit → Permissions**

Revoking a permission will disable the corresponding feature; existing recordings stay intact.

## Deleting your data

- Deleting a single investigation from the in-app history removes its metadata and all associated media files from your device.
- Uninstalling the app removes everything (private storage is wiped on uninstall by Android).

## Third-party services

The only outbound connection the app makes is to **open-meteo.com** to fetch weather. See [open-meteo.com/en/terms](https://open-meteo.com/en/terms) for their terms.

## Contact

For privacy questions, contact the app author at the address listed on the Play Store listing.
