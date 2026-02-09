/**
 * Returns the redirect URI to use for Spotify OAuth.
 * Add the exact redirect URI to Spotify Dashboard → Your App → Settings → Redirect URIs.
 */
export function getSpotifyRedirectUri() {
  if (typeof window !== 'undefined') {
    let origin = window.location.origin || '';
    
    if (origin.includes('localhost')) {
      return 'http://localhost:3000';
    }
    
    return origin.replace(/\/$/, '');
  }
  return 'http://localhost:3000';
}
