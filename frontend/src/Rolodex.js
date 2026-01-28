import { useState, useEffect } from 'react';

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

const Rolodex = () => {
  const [accessToken, setAccessToken] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Exchange authorization code for access token
  const exchangeCodeForToken = async (code, codeVerifier) => {
    setIsLoading(true);
    setError(null);
    try {
      let redirectUri = sessionStorage.getItem('spotify_redirect_uri') || window.location.origin;
      
      if (redirectUri.includes('localhost')) {
        redirectUri = redirectUri.replace('localhost', '127.0.0.1');
      }

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
        throw new Error(errorData.error_description || 'Failed to exchange code for token');
      }

      const data = await response.json();
      
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
      setError(err.message || 'Failed to complete authentication. Please try again.');
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
      const processedCode = sessionStorage.getItem('processed_auth_code');
      if (processedCode === code) {
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
        if (codeVerifier) {
          sessionStorage.setItem('processed_auth_code', code);
          exchangeCodeForToken(code, codeVerifier).catch(err => {
            setError('Failed to complete authentication. Please try logging in again.');
            sessionStorage.removeItem('processed_auth_code');
          });
        } else {
          setError('Authentication session expired. Please try logging in again.');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    }
    
    // Check for stored token (after processing code if present)
    const storedToken = sessionStorage.getItem('spotify_access_token');
    if (storedToken) {
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

  // Fetch top tracks when token is available
  useEffect(() => {
    if (!accessToken) return;

    const fetchTopTracks = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          'https://api.spotify.com/v1/me/top/tracks?limit=20',
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        );

        if (!response.ok) {
          if (response.status === 401) {
            // 401 means token is invalid/expired - clear it
            console.warn('401 Unauthorized - token expired, clearing token');
            sessionStorage.removeItem('spotify_access_token');
            sessionStorage.removeItem('token_saved_at');
            setAccessToken(null);
            setTracks([]);
            setError('Your Spotify session has expired. Please login again.');
            setIsLoading(false);
            return;
          } else if (response.status === 403) {
            // 403 usually means insufficient scopes - don't clear token, just show error
            console.warn('403 Forbidden - insufficient permissions, not clearing token');
            setError('Insufficient permissions. Please login again from the home page to grant all required permissions.');
            setIsLoading(false);
            return;
          }
          throw new Error('Failed to fetch top tracks.');
        }

        const data = await response.json();
        const tracksList = data.items || [];

        if (tracksList.length === 0) {
          throw new Error('No top tracks found.');
        }

        setTracks(tracksList);
        setActiveIndex(0);
      } catch (err) {
        setError(err.message || 'Failed to load top tracks.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTopTracks();
  }, [accessToken]);

  // Handle login to Spotify using Authorization Code Flow with PKCE
  const handleLogin = async () => {
    try {
      sessionStorage.removeItem('processed_auth_code');
      sessionStorage.removeItem('spotify_access_token');
      
      // Store intended route so SpotifyCallback knows where to redirect
      // Use current pathname to stay on the same page after login
      const currentPath = window.location.pathname;
      sessionStorage.setItem('spotify_intended_route', currentPath);
      
      let redirectUri = window.location.origin;
      if (redirectUri.includes('localhost')) {
        redirectUri = redirectUri.replace('localhost', '127.0.0.1');
      }

      sessionStorage.setItem('spotify_redirect_uri', redirectUri);

      const { codeVerifier, codeChallenge } = await generatePKCE();
      sessionStorage.setItem('pkce_code_verifier', codeVerifier);

      // Use the same broad scopes as the home page to ensure compatibility
      const scope = 'user-library-read user-top-read playlist-read-private playlist-read-collaborative';
      const authUrl = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
      
      window.location.href = authUrl;
    } catch (err) {
      setError('Failed to start authentication. Please try again.');
      console.error('PKCE generation error:', err);
    }
  };

  // Navigation handlers with circular wrap-around
  const handlePrevious = () => {
    if (tracks.length === 0) return;
    // Wrap around: if at index 0, go to last track
    setActiveIndex(activeIndex === 0 ? tracks.length - 1 : activeIndex - 1);
  };

  // Get card style based on position relative to active card - 3D Card Deck Flip Animation
  const getCardStyle = (index) => {
    const isActive = index === activeIndex;
    
    // Calculate circular distance (shortest path around the circle)
    const totalTracks = tracks.length;
    const directDistance = index - activeIndex;
    
    // Calculate wrap-around distances
    let forwardDistance, backwardDistance;
    if (directDistance >= 0) {
      forwardDistance = directDistance;
      backwardDistance = -(totalTracks - directDistance);
    } else {
      forwardDistance = totalTracks + directDistance;
      backwardDistance = directDistance;
    }
    
    // Use the shorter path (direct or wrap-around)
    const relativePosition = Math.abs(forwardDistance) <= Math.abs(backwardDistance) 
      ? forwardDistance 
      : backwardDistance;
    
    const distance = Math.abs(relativePosition);
    
    // Only show cards within a certain range
    const maxVisibleDistance = 10;
    if (distance > maxVisibleDistance) {
      return {
        display: 'none',
      };
    }

    // Active Card: rotateX(0deg) - flat and visible (shows front/blue-green)
    if (isActive) {
      return {
        transform: 'translateX(-50%) rotateX(0deg)',
        zIndex: totalTracks + 1,
        pointerEvents: 'auto',
        opacity: 1,
      };
    }

    // Calculate rotateX angle similar to reference: -141 + relativePosition
    // This creates a fan effect where cards rotate around the bottom pivot
    // Past cards (negative relativePosition) will rotate to show back (red) side
    // Future cards (positive relativePosition) will rotate to show front side
    const baseAngle = -141; // Starting angle from reference
    const rotateXAngle = baseAngle + relativePosition;
    
    const zIndex = totalTracks + 1 - distance; // Higher z-index for cards closer to active
    
    // Reduce opacity for cards further away - increased base opacity for more visibility
    const opacity = Math.max(0.6, 1 - (distance * 0.05));
    
    return {
      transform: `translateX(-50%) rotateX(${rotateXAngle}deg)`,
      zIndex: zIndex,
      pointerEvents: 'none',
      opacity: opacity,
    };
  };

  if (!accessToken) {
    return (
      <div className="rolodex-container">
        <h2 className="about-title">My Rolodex</h2>
        <div className="rolodex-login">
          <p className="rolodex-description">
            Login to Spotify to view your top tracks in a 3D rolodex interface.
          </p>
          <button onClick={handleLogin} className="mood-button" disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Login to Spotify'}
          </button>
          {error && <p className="error-message">Error: {error}</p>}
        </div>
      </div>
    );
  }

  if (isLoading && tracks.length === 0) {
    return (
      <div className="rolodex-container">
        <h2 className="about-title">My Rolodex</h2>
        <p className="loading-message">Loading your top tracks...</p>
      </div>
    );
  }

  if (error && tracks.length === 0) {
    return (
      <div className="rolodex-container">
        <h2 className="about-title">My Rolodex</h2>
        <p className="error-message">Error: {error}</p>
        <button onClick={handleLogin} className="mood-button">
          Login Again
        </button>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="rolodex-container">
        <h2 className="about-title">My Rolodex</h2>
        <p className="error-message">No tracks found.</p>
      </div>
    );
  }

  return (
    <div className="rolodex-container rolodex-container-logged-in">
      <h2 className="about-title">My Rolodex</h2>
      <p className="rolodex-subtitle">Your Top Tracks</p>
      
      {/* Single nav button above the rolodex - replay/spin icon like music player */}
      <div className="rolodex-nav-above">
        <button
          className="rolodex-nav-button"
          onClick={handlePrevious}
          disabled={tracks.length === 0}
          aria-label="Previous track"
        >
          <svg className="rolodex-replay-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      </div>

      <div className="rolodex-wrapper">
        {/* Cards Container */}
        <div className="rolodex-cards-container">
          {/* Horizontal Bar - Visual element to mimic rolodex */}
          <div className="rolodex-axle"></div>
          {tracks
            .map((track, index) => ({ track, index }))
            .sort((a, b) => {
              // Sort so active card renders last (on top in DOM)
              if (a.index === activeIndex) return 1;
              if (b.index === activeIndex) return -1;
              return 0;
            })
            .map(({ track, index }) => {
              const cardStyle = getCardStyle(index);
              const isActive = index === activeIndex;
              const albumImage = track.album?.images?.[0]?.url || '';

              return (
                <div
                  key={track.id}
                  className={`rolodex-card ${isActive ? 'rolodex-card-active' : ''}`}
                  style={cardStyle}
                >
                  {/* Front side - shows for active card */}
                  <div className="rolodex-card-front">
                    {isActive ? (
                      // Active card: Spotify iframe scaled to fit card (wrapper clips to card size)
                      <div className="rolodex-iframe-wrap">
                        <iframe
                          src={`https://open.spotify.com/embed/track/${track.id}`}
                          width="300"
                          height="380"
                          frameBorder="0"
                          allowtransparency="true"
                          allow="encrypted-media"
                          title={`${track.name} by ${track.artists.map(a => a.name).join(', ')}`}
                          className="rolodex-iframe"
                        />
                      </div>
                    ) : (
                      // Inactive card front: render album art
                      <div className="rolodex-card-image">
                        <img
                          src={albumImage || '/logo192.png'}
                          alt={`${track.name} by ${track.artists.map(a => a.name).join(', ')}`}
                          className="rolodex-album-art"
                        />
                        <div className="rolodex-card-info">
                          <p className="rolodex-track-name">{track.name}</p>
                          <p className="rolodex-artist-name">
                            {track.artists.map(a => a.name).join(', ')}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Back side - shows for past cards (red stack) */}
                  <div className="rolodex-card-back">
                    <div className="rolodex-card-back-content">
                      <p className="rolodex-back-track-name">{track.name}</p>
                      <p className="rolodex-back-artist-name">
                        {track.artists.map(a => a.name).join(', ')}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Track Info Display */}
      <div className="rolodex-track-info">
        <p className="rolodex-track-counter">
          {activeIndex + 1} / {tracks.length}
        </p>
      </div>
    </div>
  );
};

export default Rolodex;

