import { useState, useEffect } from 'react';
import { getSpotifyRedirectUri } from './utils/spotifyAuth';

const SPOTIFY_CLIENT_ID = process.env.REACT_APP_SPOTIFY_CLIENT_ID || '3c2e02bde2364852bb36f1d913e4d115';

// Generate PKCE code verifier and challenge
const generatePKCE = () => {
  const generateRandomString = (length) => {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], '');
  };

  const codeVerifier = generateRandomString(128);
  
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
    .then(buffer => {
      const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      return { codeVerifier, codeChallenge };
    });
};

const ArtistRecommender = () => {
  const [accessToken, setAccessToken] = useState(null);
  const [topArtists, setTopArtists] = useState([]);
  const [geminiRecommendation, setGeminiRecommendation] = useState(null);
  const [recommendedArtist, setRecommendedArtist] = useState(null); // { id, name, image }
  const [topTrackId, setTopTrackId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Exchange authorization code for access token
  const exchangeCodeForToken = async (code, codeVerifier) => {
    setIsLoading(true);
    setError(null);
    try {
      const redirectUri = sessionStorage.getItem('spotify_redirect_uri') || getSpotifyRedirectUri();

      console.log('Exchanging code for token...', { 
        code: code.substring(0, 10) + '...', 
        redirectUri,
        hasCodeVerifier: !!codeVerifier 
      });

      // Exchange authorization code for access token using PKCE (no client secret needed)
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
          client_id: SPOTIFY_CLIENT_ID,
          code_verifier: codeVerifier,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Token exchange failed:', errorData);
        throw new Error(errorData.error_description || 'Failed to exchange code for token');
      }

      const data = await response.json();
      console.log('Token exchange successful');
      
      if (data.access_token) {
        // Save token to sessionStorage FIRST before setting state
        sessionStorage.setItem('spotify_access_token', data.access_token);
        sessionStorage.setItem('token_saved_at', Date.now().toString()); // Track when token was saved
        console.log('Token saved to sessionStorage:', data.access_token.substring(0, 20) + '...');
        setAccessToken(data.access_token);
        sessionStorage.removeItem('pkce_code_verifier');
        sessionStorage.removeItem('processed_auth_code');
        sessionStorage.removeItem('spotify_redirect_uri');
        // Don't remove intended_route here - let the page handle it
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        throw new Error('No access token in response');
      }
    } catch (err) {
      const errorMessage = err.message || 'Failed to complete authentication. Please try again.';
      setError(errorMessage);
      console.error('Token exchange error:', err);
      // Clean up URL even on error
      window.history.replaceState({}, document.title, window.location.pathname);
    } finally {
      setIsLoading(false);
    }
  };

  // Check for stored token on component mount and handle authorization code callback
  useEffect(() => {
    // Function to sync authentication state from sessionStorage
    const syncAuthState = () => {
      const storedToken = sessionStorage.getItem('spotify_access_token');
      if (storedToken) {
        // Always sync if token exists in storage
        if (!accessToken || accessToken !== storedToken) {
          console.log('Syncing token from sessionStorage');
          setAccessToken(storedToken);
        }
      } else {
        // Clear state if token is removed
        if (accessToken) {
          setAccessToken(null);
        }
      }
    };

    // Check for stored token on mount
    syncAuthState();

    // Listen for storage changes (when user logs in on another tab/page)
    const handleStorageChange = (e) => {
      if (e.key === 'spotify_access_token') {
        syncAuthState();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Also check on window focus
    const handleFocus = () => {
      syncAuthState();
    };
    window.addEventListener('focus', handleFocus);

    // Check periodically to catch same-tab login changes
    // Use longer interval to avoid race conditions
    const intervalId = setInterval(() => {
      syncAuthState();
    }, 2000); // Check every 2 seconds

    // Handle authorization code callback FIRST (even if we have a token, code might be for re-auth)
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    // If we have a code, process it (might be a new login or re-auth)
    if (code) {
      // Check if we've already processed this code (prevent double processing)
      const processedCode = sessionStorage.getItem('processed_auth_code');
      if (processedCode === code) {
        console.log('Code already processed, skipping...');
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        console.log('Found authorization code in URL');
        const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
        if (codeVerifier) {
          console.log('Found code verifier, exchanging code...');
          // Mark code as being processed
          sessionStorage.setItem('processed_auth_code', code);
          exchangeCodeForToken(code, codeVerifier).catch(err => {
            console.error('Error in exchangeCodeForToken:', err);
            setError('Failed to complete authentication. Please try logging in again.');
            sessionStorage.removeItem('processed_auth_code');
          });
          // Don't return early - let the code exchange complete
        } else {
          console.error('No code verifier found in sessionStorage');
          setError('Authentication session expired. Please try logging in again.');
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    }
    
    // Check for stored token (after processing code if present)
    const storedToken = sessionStorage.getItem('spotify_access_token');
    if (storedToken) {
      console.log('Found stored token');
      setAccessToken(storedToken);
      // Clean up any code from URL if we already have a token and no code processing happened
      if (!code) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle login to Spotify using Authorization Code Flow with PKCE
  const handleLogin = async () => {
    try {
      // Clear any old authentication data
      sessionStorage.removeItem('processed_auth_code');
      sessionStorage.removeItem('spotify_access_token');
      
      // Store intended route so SpotifyCallback knows where to redirect
      // Use current pathname to stay on the same page after login
      const currentPath = window.location.pathname;
      sessionStorage.setItem('spotify_intended_route', currentPath);
      
      const redirectUri = getSpotifyRedirectUri();
      sessionStorage.setItem('spotify_redirect_uri', redirectUri);

      const { codeVerifier, codeChallenge } = await generatePKCE();
      sessionStorage.setItem('pkce_code_verifier', codeVerifier);

      // Use the same broad scopes as the home page to ensure compatibility
      const scope = 'user-library-read user-top-read playlist-read-private playlist-read-collaborative';
      const authUrl = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
      
      console.log('Initiating login with redirect URI:', redirectUri);
      window.location.href = authUrl;
    } catch (err) {
      setError('Failed to start authentication. Please try again.');
      console.error('PKCE generation error:', err);
    }
  };

  // Get recommendation from Gemini Prompt API
  const getRecommendation = async () => {
    setIsLoading(true);
    setError(null);
    setGeminiRecommendation(null);
    setRecommendedArtist(null);
    setTopTrackId(null);

    try {
      // Step 1: Fetch top artists from Spotify
      const artistsResponse = await fetch(
        'https://api.spotify.com/v1/me/top/artists?limit=5&time_range=short_term',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (!artistsResponse.ok) {
        if (artistsResponse.status === 401) {
          // 401 means token is invalid/expired - clear it
          console.warn('401 Unauthorized - token expired, clearing token');
          sessionStorage.removeItem('spotify_access_token');
          sessionStorage.removeItem('token_saved_at');
          setAccessToken(null);
          setTopArtists([]);
          setGeminiRecommendation(null);
          setError('Your Spotify session has expired. Please login again.');
          setIsLoading(false);
          return;
        } else if (artistsResponse.status === 403) {
          // 403 usually means insufficient scopes - don't clear token, just show error
          console.warn('403 Forbidden - insufficient permissions, not clearing token');
          setError('Insufficient permissions. Please login again from the home page to grant all required permissions.');
          setIsLoading(false);
          return;
        }
        throw new Error('Failed to fetch top artists.');
      }

      const artistsData = await artistsResponse.json();
      const artists = artistsData.items || [];

      if (artists.length === 0) {
        throw new Error('No top artists found.');
      }

      setTopArtists(artists);

      // Step 2: Create prompt for Gemini
      const artistNames = artists.map(artist => artist.name).join(', ');
      const prompt = `Based on my top artists: ${artistNames}, recommend one new artist for me. Output only the artist name and nothing else.`;

      console.log('Making Gemini API request...', {
        promptLength: prompt.length,
        artistCount: artists.length
      });

      // Step 3: Call Gemini API (free tier: gemini-2.5-flash-lite)
      const GEMINI_API_KEY = process.env.REACT_APP_GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
        throw new Error('Gemini API key is not configured. Please set REACT_APP_GEMINI_API_KEY in your .env file.');
      }
      const geminiResponse = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are a music expert. Given a list of artists, recommend one single artist that matches the vibe. Output only the artist name and nothing else.\n\n${prompt}`
                  }
                ]
              }
            ]
          })
        }
      );

      if (!geminiResponse.ok) {
        const errorData = await geminiResponse.json().catch(() => ({}));
        console.error('Gemini API error:', errorData);
        const apiMessage =
          errorData?.error?.message ||
          errorData?.message ||
          `Failed to get recommendation from Gemini API. Status: ${geminiResponse.status}`;
        const apiCode = errorData?.error?.code;
        const apiStatus = errorData?.error?.status;
        throw new Error(
          [apiMessage, apiCode ? `Code: ${apiCode}` : null, apiStatus ? `Status: ${apiStatus}` : null]
            .filter(Boolean)
            .join(' | ')
        );
      }

      const geminiData = await geminiResponse.json();
      console.log('Gemini API success! Full response:', geminiData);

      // Parse the response
      const recommendationText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!recommendationText || recommendationText.trim().length === 0) {
        console.error('No text in Gemini response:', geminiData);
        throw new Error('No recommendation received from Gemini.');
      }

      const artistName = recommendationText.trim();
      setGeminiRecommendation(artistName);

      // Step 4: Search for the artist on Spotify
      // Use exact phrase matching by wrapping in quotes for better accuracy
      console.log('Searching for artist on Spotify:', artistName);
      const searchQuery = `"${artistName}"`;
      const searchResponse = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=artist&limit=20`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (!searchResponse.ok) {
        throw new Error('Failed to search for artist on Spotify.');
      }

      const searchData = await searchResponse.json();
      const searchArtists = searchData.artists?.items || [];

      if (searchArtists.length === 0) {
        throw new Error(`Artist "${artistName}" not found on Spotify.`);
      }

      // Try to find an exact match first (case-insensitive)
      const normalizedArtistName = artistName.toLowerCase().trim();
      let foundArtist = searchArtists.find(artist => 
        artist.name.toLowerCase().trim() === normalizedArtistName
      );

      // If no exact match, try partial match (artist name contains the search term or vice versa)
      if (!foundArtist) {
        foundArtist = searchArtists.find(artist => {
          const normalizedFoundName = artist.name.toLowerCase().trim();
          return normalizedFoundName.includes(normalizedArtistName) || 
                 normalizedArtistName.includes(normalizedFoundName);
        });
      }

      // Fallback to first result if no match found, but log a warning
      if (!foundArtist) {
        console.warn(`No exact match found for "${artistName}". Using first result: "${searchArtists[0].name}"`);
        foundArtist = searchArtists[0];
      } else {
        console.log(`Found exact match: "${foundArtist.name}" for search "${artistName}"`);
      }
      const artistImage = foundArtist.images && foundArtist.images.length > 0
        ? (foundArtist.images[1]?.url || foundArtist.images[0]?.url)
        : null;

      setRecommendedArtist({
        id: foundArtist.id,
        name: foundArtist.name,
        image: artistImage
      });

      // Step 5: Get the artist's top tracks
      console.log('Fetching top tracks for artist:', foundArtist.id);
      const topTracksResponse = await fetch(
        `https://api.spotify.com/v1/artists/${foundArtist.id}/top-tracks?market=US`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (!topTracksResponse.ok) {
        throw new Error('Failed to fetch artist top tracks.');
      }

      const topTracksData = await topTracksResponse.json();
      const tracks = topTracksData.tracks || [];

      if (tracks.length === 0) {
        throw new Error('No top tracks found for this artist.');
      }

      // Get the first (most popular) track
      const topTrack = tracks[0];
      if (topTrack && topTrack.id) {
        setTopTrackId(topTrack.id);
        console.log('Top track found:', topTrack.name, topTrack.id);
      } else {
        throw new Error('Top track has no valid ID.');
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="spotify-player-container">
      <h2 className="spotify-title">Artist Vibe</h2>

      {!accessToken ? (
        <div className="about-content">
          <p className="about-body">
            Connect your Spotify account to discover new artists based on your listening habits!
          </p>
          <button onClick={handleLogin} className="mood-button">
            Login to Spotify
          </button>
        </div>
      ) : (
        <div className="about-content">
          <button 
            onClick={getRecommendation} 
            className="mood-button"
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Get My Vibe Recommendation'}
          </button>

          {isLoading && (
            <p className="loading-message">Finding your perfect artist match...</p>
          )}

          {error && (
            <p className="error-message">Error: {error}</p>
          )}

          {topArtists.length > 0 && (
            <div className="about-features" style={{ marginTop: '30px' }}>
              <h4>Your Top Artists</h4>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {topArtists.map((artist, index) => {
                  // Get the best available image (prefer medium size, fallback to first available)
                  const artistImage = artist.images && artist.images.length > 0 
                    ? (artist.images[1]?.url || artist.images[0]?.url)
                    : null;
                  
                  return (
                    <li 
                      key={artist.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        marginBottom: '15px',
                        padding: '10px',
                        background: 'rgba(93, 63, 211, 0.1)',
                        borderRadius: '8px',
                        border: '1px solid rgba(93, 63, 211, 0.2)'
                      }}
                    >
                      {artistImage && (
                        <img
                          src={artistImage}
                          alt={artist.name}
                          style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '50%',
                            marginRight: '15px',
                            objectFit: 'cover',
                            border: '2px solid rgba(93, 63, 211, 0.3)'
                          }}
                        />
                      )}
                      <span style={{ fontSize: '16px', color: '#FFFFFF' }}>
                        {index + 1}. {artist.name}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {geminiRecommendation && (
            <div className="about-features" style={{ marginTop: '30px', background: 'rgba(93, 63, 211, 0.2)', padding: '20px', borderRadius: '12px' }}>
              <h3 style={{ color: '#5D3FD3', fontSize: '24px', marginBottom: '15px' }}>
                MoodGroove Recommends:
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', gap: '15px' }}>
                {recommendedArtist?.image && (
                  <img
                    src={recommendedArtist.image}
                    alt={recommendedArtist.name}
                    style={{
                      width: '100px',
                      height: '100px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '3px solid rgba(93, 63, 211, 0.5)'
                    }}
                  />
                )}
                <p style={{ fontSize: '20px', fontWeight: '600', color: '#FFFFFF', margin: 0 }}>
                  {geminiRecommendation}
                </p>
              </div>
              {topTrackId && (
                <div style={{ marginTop: '20px' }}>
                  <h4 style={{ color: '#5D3FD3', fontSize: '18px', marginBottom: '10px' }}>
                    Top Track:
                  </h4>
                  <iframe
                    title={`Spotify player for ${recommendedArtist?.name || 'recommended artist'}'s top track`}
                    src={`https://open.spotify.com/embed/track/${topTrackId}`}
                    width="100%"
                    height="380"
                    frameBorder="0"
                    allowtransparency="true"
                    allow="encrypted-media"
                    style={{ borderRadius: '8px' }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ArtistRecommender;

