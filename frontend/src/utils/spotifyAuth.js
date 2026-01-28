/**
 * Returns the redirect URI to use for Spotify OAuth.
 * Priority:
 * 1. REACT_APP_SPOTIFY_REDIRECT_URI – explicit (e.g. https://your-app.vercel.app)
 * 2. REACT_APP_VERCEL_URL – build with https (set in Vercel to $VERCEL_URL so each deployment gets its own URL)
 * 3. window.location.origin (local dev or fallback)
 * No trailing slash is ever returned.
 */
export function getSpotifyRedirectUri() {
  const explicit = process.env.REACT_APP_SPOTIFY_REDIRECT_URI;
  if (explicit && typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim().replace(/\/$/, '');
  }
  const vercelUrl = process.env.REACT_APP_VERCEL_URL;
  if (vercelUrl && typeof vercelUrl === 'string' && vercelUrl.trim()) {
    const base = vercelUrl.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    return base ? `https://${base}` : '';
  }
  if (typeof window === 'undefined') return '';
  let origin = window.location.origin || '';
  if (origin.includes('localhost')) {
    origin = origin.replace('localhost', '127.0.0.1');
  }
  return origin.replace(/\/$/, '');
}
