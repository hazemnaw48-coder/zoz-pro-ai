# ZOZ FieldOps Android client

This is a separate Android client for the FieldOps service. It does not replace or share the package identity of the ZOZ Flow Bridge.

- Package: `com.zozfieldops.client`
- Minimum Android: 10 (API 29)
- Loads only the HTTPS FieldOps GitHub Pages origin/path.
- Uses the existing FieldOps Supabase authentication and company-scoped backend; it does not embed service-role keys or create a second data store.
- Supports Android document selection for uploads and saves Blob-based exports to Downloads/ZOZ FieldOps.
- Requires internet access; this is not an offline-first client.

CI produces a debug-signed APK for controlled sideload testing. It is not a Play Store release; public store distribution requires a separately managed release signing key and policy review.
