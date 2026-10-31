# Legacy Supabase artifacts

This folder is **legacy**. PRISMBURST moved to Firebase Authentication + Firestore (see `docs/FIREBASE-SETUP.md` and `firestore.rules`).

Do not apply these SQL migrations to a new project for the live game. The shipped web/Android client no longer loads `lib/supabase.min.js` or calls Supabase Auth / PostgREST.

The files are kept only so old reviews and history remain readable.
