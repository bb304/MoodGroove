import { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
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

// Format duration from milliseconds to M:SS format
const formatDuration = (ms) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Get today's date in MM/DD/YYYY format
const getTodayDate = () => {
  const today = new Date();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  const year = today.getFullYear();
  return `${month}/${day}/${year}`;
};

const WhatsMyOrder = () => {
  const [accessToken, setAccessToken] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSharing, setIsSharing] = useState(false);
  const guestCheckRef = useRef(null);

  // Exchange authorization code for access token
  const exchangeCodeForToken = async (code, codeVerifier) => {
    setIsLoading(true);
    setError(null);
    try {
      const redirectUri = sessionStorage.getItem('spotify_redirect_uri') || getSpotifyRedirectUri();

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
          'https://api.spotify.com/v1/me/top/tracks?limit=13&time_range=short_term',
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
      } catch (err) {
        setError(err.message || 'Failed to load top tracks.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTopTracks();
  }, [accessToken]);

  // Capture and share the guest check as an image
  const handleShare = async () => {
    if (!guestCheckRef.current || isSharing) return;
    
    setIsSharing(true);
    try {
      // Wait a bit to ensure all images are loaded
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Capture the guest check container as an image
      const canvas = await html2canvas(guestCheckRef.current, {
        backgroundColor: '#ffffff', // White background to match receipt
        scale: 2, // Higher quality for better image
        useCORS: true, // Allow cross-origin images
        allowTaint: false, // Don't allow tainted canvas
        logging: false, // Disable console logs
        width: guestCheckRef.current.offsetWidth,
        height: guestCheckRef.current.offsetHeight,
        windowWidth: guestCheckRef.current.scrollWidth,
        windowHeight: guestCheckRef.current.scrollHeight,
      });

      // Convert canvas to blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          throw new Error('Failed to create image');
        }

        const file = new File([blob], 'guest-check.png', { type: 'image/png' });

        // Try Web Share API first (works on mobile and some desktop browsers)
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: 'My MoodGroove Guest Check',
              text: 'Check out my top tracks!',
              files: [file],
            });
            setIsSharing(false);
            return;
          } catch (shareError) {
            // If share fails, fall back to download
            console.log('Share failed, falling back to download:', shareError);
          }
        }

        // Fallback: Download the image
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'moodgroove-guest-check.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setIsSharing(false);
      }, 'image/png');
    } catch (err) {
      console.error('Error capturing image:', err);
      setError('Failed to capture image. Please try again.');
      setIsSharing(false);
    }
  };

  // Handle login to Spotify using Authorization Code Flow with PKCE
  const handleLogin = async () => {
    try {
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
      
      window.location.href = authUrl;
    } catch (err) {
      setError('Failed to start authentication. Please try again.');
      console.error('PKCE generation error:', err);
    }
  };

  if (!accessToken) {
    return (
      <div className="rolodex-container">
        <h2 className="about-title">What's My Order</h2>
        <div className="rolodex-login">
          <p className="rolodex-description">
            Login to Spotify to see your top tracks on a guest check.
          </p>
          <button onClick={handleLogin} className="mood-button" disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Login to Spotify'}
          </button>
          {error && <p className="error-message">Error: {error}</p>}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rolodex-container">
        <h2 className="about-title">What's My Order</h2>
        <p className="loading-message">Loading your top tracks...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rolodex-container">
        <h2 className="about-title">What's My Order</h2>
        <p className="error-message">Error: {error}</p>
        <button onClick={handleLogin} className="mood-button">
          Login Again
        </button>
      </div>
    );
  }

  return (
    <div className="guest-check-wrapper">
      <div className="guest-check-container" ref={guestCheckRef}>
        <div className="guest-check-content">
          {/* Date */}
          <p className="order-date">{getTodayDate()}</p>
          
          {/* Server */}
          <p className="order-server">MoodGroove</p>
          
          {/* Guests */}
          <p className="order-guests">1</p>
          
          {/* Track List - Using grid overlay for perfect alignment */}
          <div className="tracks-grid-overlay">
            {tracks.slice(0, 13).map((track, index) => (
              <div key={track.id} className="track-row">
                <div className="track-cell track-number">
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className="track-cell track-name">
                  {track.name} - {track.artists.map(a => a.name).join(', ')}
                </div>
                <div className="track-cell track-duration">
                  {formatDuration(track.duration_ms)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <button 
        onClick={handleShare} 
        className="share-button" 
        disabled={isSharing || tracks.length === 0}
        aria-label="Share guest check"
      >
        {isSharing ? 'Creating Image...' : 'Share Guest Check'}
      </button>
    </div>
  );
};

export default WhatsMyOrder;

