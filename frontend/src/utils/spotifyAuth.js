/**
 * Returns the redirect URI to use for Spotify OAuth.
 * Uses window.location.origin when available (reliable for localhost and Vercel).
 * Add the exact redirect URI to Spotify Dashboard → Your App → Settings → Redirect URIs.
 * No trailing slash is ever returned.
 */
export function getSpotifyRedirectUri() {
  if (typeof window !== 'undefined') {
    let origin = window.location.origin || '';
    if (origin.includes('localhost')) {
      origin = origin.replace('localhost', '127.0.0.1');
    }
    return origin.replace(/\/$/, '');
  }
  return 'http://localhost:3000';
}
