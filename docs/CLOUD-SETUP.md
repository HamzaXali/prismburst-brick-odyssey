# Cloud save setup

PRISMBURST cloud save now uses **Firebase** (Spark / free plan): Authentication + Firestore.

Follow the phone-friendly steps in **[FIREBASE-SETUP.md](./FIREBASE-SETUP.md)**.

The older Supabase SQL and migrations under `supabase/` are **legacy** and are not used by the game anymore. Do not disable anything there as a workaround; the app no longer calls Supabase.

## Conflict rule (unchanged)

When both sides have progress and you choose **Merge** (or the same account syncs on its own):

- Unlocked levels: the higher count in each world is kept.
- Each level's best score and stars: the higher number is kept.
- Owned skins: the union of both sides.
- Lifetime stats: the higher number.
- The furthest current level is kept.
- Coins, equipped skins, settings, daily reward, and mission state come from whichever side has the newer `client_updated_at`.

Firestore stores a `revision` on `saves/{uid}`. A write is accepted only if the phone's expected revision matches. On conflict the phone loads again, merges, and retries with capped exponential backoff.
