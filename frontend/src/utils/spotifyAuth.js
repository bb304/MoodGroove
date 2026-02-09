/**
 * Returns the redirect URI to use for Spotify OAuth.
 * Uses window.location.origin when available (reliable for localhost and Vercel).
 * Add the exact redirect URI to Spotify Dashboard → Your App → Settings → Redirect URIs.
 */
export function getSpotifyRedirectUri() {
  if (typeof window !== 'undefined') {
    let origin = window.location.origin || '';
    if (origin.includes('localhost')) {
      origin = origin.replace('localhost', '127.0.0.1');
    }
    return `${origin.replace(/\/$/, '')}/api/auth/callback`;
  }
  return 'http://127.0.0.1:3000/api/auth/callback';
}
