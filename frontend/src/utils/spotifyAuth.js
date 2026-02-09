/**
 * Returns the redirect URI to use for Spotify OAuth.
 * Add the exact redirect URI to Spotify Dashboard → Your App → Settings → Redirect URIs.
 */
export function getSpotifyRedirectUri() {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3000';
    }

    return 'https://moodgroove.vercel.app';
  }
  return 'http://localhost:3000';
}
