/**
 * Returns the redirect URI to use for Spotify OAuth.
 * Use REACT_APP_SPOTIFY_REDIRECT_URI in production (e.g. on Vercel) so it
 * exactly matches the URI added in the Spotify Developer Dashboard.
 * No trailing slash is ever returned.
 */
export function getSpotifyRedirectUri() {
  const env = process.env.REACT_APP_SPOTIFY_REDIRECT_URI;
  if (env && typeof env === 'string' && env.trim()) {
    return env.trim().replace(/\/$/, '');
  }
  if (typeof window === 'undefined') return '';
  let origin = window.location.origin || '';
  if (origin.includes('localhost')) {
    origin = origin.replace('localhost', '127.0.0.1');
  }
  return origin.replace(/\/$/, '');
}
