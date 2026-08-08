import { z } from 'zod/v4';

// Output shapes for the Unsplash cover-image search proxy.
//   GET  /client/v1/unsplash/search?query=&page=
//   POST /client/v1/unsplash/download   { downloadLocation }
//
// The Unsplash Access Key lives only in the server environment
// (`UNSPLASH_ACCESS_KEY`) and is attached server-side by the route handlers —
// it never reaches the client. See
// `apps/server/src/api/client/routes/unsplash`. This is a deliberately small
// projection of Unsplash's photo object: just enough to render a picker
// thumbnail, set a page/record cover, and satisfy Unsplash's attribution +
// hotlinking + "trigger download" API-guideline requirements.
export const unsplashPhotoSchema = z.object({
  id: z.string(),
  // Photo description (or alt description) — may be absent on Unsplash.
  description: z.string().nullable(),
  // Hotlinked image URLs served straight from images.unsplash.com (as the
  // Unsplash guidelines require — we never re-host).
  thumb: z.string(),
  regular: z.string(),
  full: z.string(),
  // Photographer attribution (required whenever a photo is displayed).
  authorName: z.string(),
  authorUsername: z.string(),
  // Unsplash's per-photo download-tracking endpoint. Must be pinged (with the
  // Client-ID header, server-side) whenever a photo is actually selected/used.
  downloadLocation: z.string(),
});

export type UnsplashPhoto = z.infer<typeof unsplashPhotoSchema>;

export const unsplashSearchOutputSchema = z.object({
  results: z.array(unsplashPhotoSchema),
  // Set to a machine code (e.g. 'rate_limited' | 'unavailable') when the
  // upstream call failed or was throttled. The picker degrades to an
  // "Unsplash unavailable" state rather than surfacing an error. Absent on
  // success, and also absent (with empty results) when the server has no key
  // configured — the feature is simply inert in that case.
  error: z.string().optional(),
});

export type UnsplashSearchOutput = z.infer<typeof unsplashSearchOutputSchema>;

export const unsplashDownloadOutputSchema = z.object({
  ok: z.boolean(),
});

export type UnsplashDownloadOutput = z.infer<
  typeof unsplashDownloadOutputSchema
>;
