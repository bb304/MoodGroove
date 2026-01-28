import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Home from './Home';
import ArtistRecommender from './ArtistRecommender';
import Rolodex from './Rolodex';
import WhatsMyOrder from './WhatsMyOrder';
import { getSpotifyRedirectUri } from './utils/spotifyAuth';

// Component to handle Spotify OAuth callback at root level
const SpotifyCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Handle authorization code in query string (PKCE flow)
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      // Check if there's a stored intended destination
      const intendedRoute = sessionStorage.getItem('spotify_intended_route');
      
      // Only redirect if we have an intended route and we're not already there
      if (intendedRoute && location.pathname !== intendedRoute) {
        sessionStorage.removeItem('spotify_intended_route');
        // Preserve the code in the URL when redirecting
        navigate(`${intendedRoute}?code=${code}`, { replace: true });
      } else if (!intendedRoute && location.pathname === '/') {
        // If no intended route and we're on home, just clean up the URL
        // The home page's useEffect will handle the code
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      // If we're already on the intended route, let that page's useEffect handle the code
    }
  }, [navigate, location]);

  return null;
};

// Spotify API Credentials
const SPOTIFY_CLIENT_ID = process.env.REACT_APP_SPOTIFY_CLIENT_ID || '3c2e02bde2364852bb36f1d913e4d115';

// Smart Search Map: Maps moods to accurate, curated Spotify search queries
const MOOD_SEARCH_MAP = {
  'Happy': '"Happy Hits"',
  'Sad': '"Sad Songs"',
  'Calm': '"Chill Mix"',
  'Energetic': '"Workout Mix"',
  'Focus': '"Lofi Beats"'
};

// Default Vibe Profiles for filtering songs (fallback when user hasn't trained)
const VIBE_PROFILES = {
  'Happy': {
    minValence: 0.7,
    maxEnergy: 0.6,
    minAcousticness: 0.6
  },
  'Sad': {
    maxValence: 0.3,
    maxEnergy: 0.4,
    maxTempo: 100
  },
  'Calm': {
    minValence: 0.6,
    maxEnergy: 0.4,
    minAcousticness: 0.7
  },
  'Energetic': {
    minEnergy: 0.7,
    minDanceability: 0.7
  },
  'Focus': {
    minInstrumentalness: 0.7,
    maxEnergy: 0.5
  }
};

// Generate PKCE code verifier and challenge
const generatePKCE = async () => {
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

function App() {
  // Authentication state
  const [accessToken, setAccessToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // State Management
  const [trackId, setTrackId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [moodHistory, setMoodHistory] = useState([]);
  
  // Learning feature state
  const [currentMood, setCurrentMood] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [likedSongs, setLikedSongs] = useState({});
  const [blockedSongs, setBlockedSongs] = useState({});
  
  // Adaptive vibe profiles state
  // eslint-disable-next-line no-unused-vars
  const [likedSongFeatures, setLikedSongFeatures] = useState({});
  const [userVibeProfiles, setUserVibeProfiles] = useState({});

  // Moods array (for rendering buttons)
  const MOODS = ['Happy', 'Sad', 'Calm', 'Energetic', 'Focus'];

  // Function to clear all user-specific data when account switches
  const clearUserData = () => {
    setLikedSongs({});
    setBlockedSongs({});
    setLikedSongFeatures({});
    setUserVibeProfiles({});
    setMoodHistory([]);
    setTrackId(null);
    setCurrentMood(null);
    setError(null);
  };

  // Function to detect account switch and clear user data if needed
  // IMPORTANT: This function NEVER clears the token - it only clears user-specific data
  const checkAndHandleAccountSwitch = async (newToken, skipIfFresh = false) => {
    try {
      // Verify token still exists in storage before making API call
      const currentStoredToken = sessionStorage.getItem('spotify_access_token');
      if (!currentStoredToken || currentStoredToken !== newToken) {
        console.log('Token changed or removed during account check, skipping');
        return null;
      }

      // If this is a fresh token (just saved), skip the check to avoid 403 errors
      // Fresh tokens might take a moment to become fully valid
      if (skipIfFresh) {
        const tokenSavedAt = sessionStorage.getItem('token_saved_at');
        if (tokenSavedAt) {
          const age = Date.now() - parseInt(tokenSavedAt);
          if (age < 3000) { // Less than 3 seconds old - skip check
            console.log('Token is too fresh, skipping account check to avoid 403');
            return null;
          }
        }
      }

      console.log('checkAndHandleAccountSwitch: Making API call to /v1/me');
      
      // Get current user ID from Spotify API
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${newToken}` }
      });
      
      console.log('checkAndHandleAccountSwitch: Response status:', response.status);
      
      if (response.ok) {
        const userData = await response.json();
        const newUserId = userData.id;
        const storedUserId = sessionStorage.getItem('spotify_user_id');
        
        console.log('Checking user ID:', { storedUserId, newUserId, match: storedUserId === newUserId });
        
        // Verify token still exists after API call
        const tokenAfterCall = sessionStorage.getItem('spotify_access_token');
        if (!tokenAfterCall || tokenAfterCall !== newToken) {
          console.error('CRITICAL: Token was removed during account check! This should never happen.');
          return null;
        }
        
        // If user ID changed (and we had a previous user), clear all user data
        // BUT NEVER CLEAR THE TOKEN - only clear user-specific preferences
        if (storedUserId && storedUserId !== newUserId) {
          console.log('Account switch detected - clearing user data (but keeping token)');
          clearUserData();
        }
        
        // Always store the current user ID (for first-time login or account switch)
        sessionStorage.setItem('spotify_user_id', newUserId);
        sessionStorage.removeItem('has_403_error'); // Clear the 403 error flag on success
        console.log('checkAndHandleAccountSwitch: Successfully stored user ID');
        return newUserId;
      } else if (response.status === 401) {
        // 401 means token is invalid/expired - clear it
        console.warn('401 Unauthorized when checking user ID - token expired, clearing token');
        sessionStorage.removeItem('spotify_access_token');
        sessionStorage.removeItem('token_saved_at');
        sessionStorage.removeItem('spotify_user_id');
        setAccessToken(null);
        setIsAuthenticated(false);
        clearUserData();
        return null;
      } else if (response.status === 403) {
        // 403 on /v1/me is very unusual - this endpoint should work with any valid token
        // However, if the token is very fresh (just saved), it might not be fully valid yet
        // Check token age before clearing
        const tokenSavedAt = sessionStorage.getItem('token_saved_at');
        const tokenAge = tokenSavedAt ? (Date.now() - parseInt(tokenSavedAt)) : Infinity;
        
        if (tokenAge < 5000) {
          // Token is less than 5 seconds old - might not be fully valid yet, don't clear it
          console.warn('403 on /v1/me but token is very fresh (' + tokenAge + 'ms old) - not clearing, will retry later');
          return null;
        }
        
        // Token is old enough that 403 is likely a real error
        console.error('403 Forbidden on /v1/me - this is unusual. App may be misconfigured. Clearing token.');
        sessionStorage.setItem('has_403_error', 'true'); // Mark that we've seen a 403 to avoid repeated checks
        sessionStorage.removeItem('spotify_access_token');
        sessionStorage.removeItem('token_saved_at');
        sessionStorage.removeItem('spotify_user_id');
        setAccessToken(null);
        setIsAuthenticated(false);
        clearUserData();
        return null;
      } else {
        // If API call failed for other reasons, log it but don't clear anything
        const errorText = await response.clone().text().catch(() => '');
        console.warn('Failed to get user ID from Spotify API:', response.status, errorText);
        // Don't clear user data or token here - might be a temporary network issue
        return null;
      }
    } catch (err) {
      console.warn('Failed to check user ID:', err);
      // If we can't verify, don't clear anything - might be a network issue
      // NEVER clear the token from this function
      // Verify token is still there after error
      const tokenAfterError = sessionStorage.getItem('spotify_access_token');
      if (!tokenAfterError) {
        console.error('CRITICAL: Token was removed after error in checkAndHandleAccountSwitch! This should never happen.');
      }
      return null;
    }
  };

  // Check for stored token on mount and handle authorization code callback
  useEffect(() => {
    // Function to sync authentication state from sessionStorage
    // Always sync from sessionStorage to ensure state matches reality
    const syncAuthState = async () => {
      const storedToken = sessionStorage.getItem('spotify_access_token');
      console.log('syncAuthState called:', { hasToken: !!storedToken, tokenPreview: storedToken ? storedToken.substring(0, 20) + '...' : 'none' });
      
      if (storedToken) {
        // Always update state if token exists in storage FIRST (critical - don't block on account check)
        setAccessToken(storedToken);
        setIsAuthenticated(true);
        console.log('Token synced to state successfully');
        
        // Then check for account switch (non-blocking, don't let it prevent state update)
        // Only check if we haven't checked recently (avoid spam)
        // Also skip if we've already detected a 403 error (to avoid repeated failed calls)
        // Skip if token is very fresh (less than 5 seconds old) to avoid 403 errors
        const lastCheck = sessionStorage.getItem('last_account_check');
        const has403Error = sessionStorage.getItem('has_403_error') === 'true';
        const tokenSavedAt = sessionStorage.getItem('token_saved_at');
        const now = Date.now();
        const tokenAge = tokenSavedAt ? (now - parseInt(tokenSavedAt)) : Infinity;
        const isFreshToken = tokenAge < 5000; // Less than 5 seconds old
        
        if (!has403Error && !isFreshToken && (!lastCheck || (now - parseInt(lastCheck)) > 10000)) { // Check every 10 seconds
          sessionStorage.setItem('last_account_check', now.toString());
          checkAndHandleAccountSwitch(storedToken, false).catch(err => {
            console.warn('Account switch check failed during sync, but token is set:', err);
            // NEVER clear token on error from this catch block - let checkAndHandleAccountSwitch handle it
          });
        } else if (isFreshToken) {
          console.log('Skipping account check - token is too fresh');
        }
      } else {
        // Only clear state if token is removed from storage AND we had a token before
        if (accessToken) {
          console.warn('Token removed from storage, clearing state');
          setAccessToken(null);
          setIsAuthenticated(false);
          clearUserData();
          sessionStorage.removeItem('spotify_user_id');
        }
      }
    };

    // Check for stored token on mount
    syncAuthState();
    
    // Also verify user ID on mount if token exists (to catch account switches from other tabs)
    // Do this asynchronously and don't block on it
    // Delay this significantly to avoid race conditions with fresh logins and 403 errors
    const verifyUserOnMount = async () => {
      // Wait longer to ensure token is fully valid and avoid 403 errors on fresh tokens
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      const storedToken = sessionStorage.getItem('spotify_access_token');
      if (storedToken) {
        // Check if token is still fresh - if so, skip verification to avoid 403 errors
        const tokenSavedAt = sessionStorage.getItem('token_saved_at');
        if (tokenSavedAt) {
          const tokenAge = Date.now() - parseInt(tokenSavedAt);
          if (tokenAge < 10000) { // Less than 10 seconds old - skip to avoid 403
            console.log('Skipping verifyUserOnMount - token is still fresh');
            return;
          }
        }
        // Check if we've seen 403 errors - if so, skip verification
        const has403Error = sessionStorage.getItem('has_403_error') === 'true';
        if (has403Error) {
          console.log('Skipping verifyUserOnMount - 403 errors detected, app may be misconfigured');
          return;
        }
        try {
          await checkAndHandleAccountSwitch(storedToken, false);
        } catch (err) {
          console.warn('User verification on mount failed:', err);
          // Don't clear token on error - might be temporary
        }
      }
    };
    verifyUserOnMount();

    // Listen for storage changes (when user logs in on another tab/page)
    const handleStorageChange = (e) => {
      if (e.key === 'spotify_access_token') {
        syncAuthState();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Also check on window focus (in case user logged in on same tab but different component)
    const handleFocus = () => {
      syncAuthState();
    };
    window.addEventListener('focus', handleFocus);

    // Also check periodically to catch same-tab login changes
    // (storage event doesn't fire for same-tab changes)
    const intervalId = setInterval(() => {
      syncAuthState();
    }, 2000); // Check every 2 seconds (reduced frequency to avoid race conditions)

    // Handle authorization code callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      const processedCode = sessionStorage.getItem('processed_auth_code');
      if (processedCode === code) {
        // Already processed this code
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

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

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exchange authorization code for access token

  const exchangeCodeForToken = async (code, codeVerifier) => {
    setIsLoading(true);
    setError(null);
    
    try {
      let redirectUri = sessionStorage.getItem('spotify_redirect_uri') || getSpotifyRedirectUri();

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
        // Save token to sessionStorage FIRST (critical - do this before anything else)
        sessionStorage.setItem('spotify_access_token', data.access_token);
        sessionStorage.setItem('token_saved_at', Date.now().toString()); // Track when token was saved
        sessionStorage.removeItem('has_403_error'); // Clear any previous 403 error flag
        console.log('Token saved to sessionStorage:', data.access_token.substring(0, 20) + '...');
        
        // Verify it was saved
        const verifyToken = sessionStorage.getItem('spotify_access_token');
        if (!verifyToken || verifyToken !== data.access_token) {
          console.error('CRITICAL: Token was not saved correctly!');
        } else {
          console.log('Token verified in sessionStorage');
        }
        
        // Set state immediately after saving to storage
        setAccessToken(data.access_token);
        setIsAuthenticated(true);
        console.log('Authentication state set to true');
        
        // Check for account switch after token is saved (non-blocking, with delay to avoid race conditions)
        // Delay the check significantly to ensure token is fully valid and avoid 403 errors
        // Use a longer delay to ensure everything is stable
        setTimeout(() => {
          // Verify token still exists before checking
          const tokenBeforeCheck = sessionStorage.getItem('spotify_access_token');
          if (tokenBeforeCheck === data.access_token) {
            // Pass skipIfFresh=true to avoid checking tokens that are too new
            checkAndHandleAccountSwitch(data.access_token, true).catch(err => {
              console.warn('Account switch check failed, but token is saved:', err);
              // Never clear token on error - might be temporary network issue
              // Verify token is still there
              const tokenAfterError = sessionStorage.getItem('spotify_access_token');
              if (!tokenAfterError) {
                console.error('CRITICAL: Token was removed after account check error!');
              }
            });
          } else {
            console.warn('Token changed before account check, skipping');
          }
        }, 3000); // Increased delay to 3 seconds to ensure token is fully valid
        
        // Clean up auth-related sessionStorage items
        sessionStorage.removeItem('pkce_code_verifier');
        sessionStorage.removeItem('processed_auth_code');
        sessionStorage.removeItem('spotify_redirect_uri');
        // Clean up intended_route after successful login
        sessionStorage.removeItem('spotify_intended_route');
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

  // Redirect to Spotify login
  const redirectToSpotifyLogin = async () => {
    try {
      sessionStorage.removeItem('processed_auth_code');
      sessionStorage.removeItem('spotify_access_token');
      sessionStorage.removeItem('spotify_user_id');
      
      // Clear user data when logging out
      clearUserData();
      
      // Store intended route
      const currentPath = window.location.pathname;
      sessionStorage.setItem('spotify_intended_route', currentPath);
      
      const redirectUri = getSpotifyRedirectUri();
      sessionStorage.setItem('spotify_redirect_uri', redirectUri);

      const { codeVerifier, codeChallenge } = await generatePKCE();
      sessionStorage.setItem('pkce_code_verifier', codeVerifier);

      const scope = 'user-library-read user-top-read playlist-read-private playlist-read-collaborative';
      const authUrl = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
      
      window.location.href = authUrl;
    } catch (err) {
      setError('Failed to start authentication. Please try again.');
      console.error('PKCE generation error:', err);
    }
  };

  // Function to add mood to history
  const addMoodToHistory = (mood) => {
    const moodEntry = {
      mood: mood,
      timestamp: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString()
    };
    setMoodHistory(prev => [moodEntry, ...prev]);
  };

  // Update user vibe profile based on liked songs
  const updateUserVibeProfile = (mood, newFeatures) => {
    setLikedSongFeatures(prev => {
      const moodFeatures = prev[mood] || [];
      const allFeatures = [...moodFeatures, newFeatures];
      
      // Need at least 3 samples to create a meaningful profile
      if (allFeatures.length < 3) {
        return { ...prev, [mood]: allFeatures };
      }

      // Calculate averages for all audio features
      const featureKeys = ['valence', 'energy', 'acousticness', 'danceability', 'instrumentalness', 'tempo'];
      const averages = {};
      
      featureKeys.forEach(key => {
        const values = allFeatures.map(f => f[key]).filter(v => v !== null && v !== undefined);
        if (values.length > 0) {
          averages[key] = values.reduce((sum, val) => sum + val, 0) / values.length;
        }
      });

      // Create target-based profile (for recommendations API)
      const newProfile = {
        target_valence: averages.valence || 0.5,
        target_energy: averages.energy || 0.5,
        target_acousticness: averages.acousticness || 0.5,
        target_danceability: averages.danceability || 0.5,
        target_instrumentalness: averages.instrumentalness || 0.5,
        target_tempo: averages.tempo || 120,
      };

      setUserVibeProfiles(prev => ({ ...prev, [mood]: newProfile }));
      
      return { ...prev, [mood]: allFeatures };
    });
  };

  // Get personalized song for mood using user's library and playlists
  const getPersonalizedSongForMood = async (mood) => {
    // Always sync from sessionStorage first to ensure we have the latest token
    const storedToken = sessionStorage.getItem('spotify_access_token');
    if (storedToken) {
      // Always sync state if token exists in storage
      if (!accessToken || accessToken !== storedToken) {
        setAccessToken(storedToken);
        setIsAuthenticated(true);
      }
      // Don't call checkAndHandleAccountSwitch here - it's already handled by useEffect sync
      // Calling it here causes unnecessary 403 errors, especially if the app is misconfigured
    }
    
    // Use the synced token
    const currentToken = accessToken || storedToken;
    
    // Guard: Check authentication
    if (!currentToken) {
      setError('Please login to Spotify to use personalized song recommendations.');
      return;
    }

    // Don't pre-validate token - let the actual API calls handle auth errors
    // The fetchWithAuthCheck function will properly detect 401/403 and handle them
    setIsLoading(true);
    setError(null);
    setTrackId(null);
    setCurrentMood(mood);

    try {
      const headers = { 'Authorization': `Bearer ${currentToken}` };

      // Helper function to handle fetch with token expiration check
      const fetchWithAuthCheck = async (url, headers) => {
        const response = await fetch(url, { headers });
        
        // Check for token expiration - only clear token for 401 (unauthorized)
        // 403 (forbidden) is usually a scope/permission issue, not an auth issue
        if (response.status === 401) {
          // 401 means the token is invalid/expired - clear it
          // BUT: Check if this is a fresh login (token was just saved) - if so, don't clear it
          const tokenAge = sessionStorage.getItem('token_saved_at');
          const now = Date.now();
          const isFreshToken = tokenAge && (now - parseInt(tokenAge)) < 5000; // Less than 5 seconds old
          
          if (isFreshToken) {
            console.warn('401 Unauthorized on fresh token - might be scope issue, NOT clearing token');
            return { items: [] };
          }
          
          console.warn('401 Unauthorized - token expired or invalid, clearing token');
          sessionStorage.removeItem('spotify_access_token');
          sessionStorage.removeItem('spotify_user_id');
          setAccessToken(null);
          setIsAuthenticated(false);
          clearUserData();
          throw new Error('AUTH_EXPIRED');
        }
        
        if (response.status === 403) {
          // 403 usually means insufficient permissions/scopes, not an auth error
          // Don't clear the token - just return empty results
          const errorText = await response.clone().text().catch(() => '');
          console.warn(`403 Forbidden for ${url} - insufficient permissions (likely scope issue), not clearing token. Error:`, errorText);
          return { items: [] };
        }
        
        if (!response.ok) {
          // Log other errors for debugging
          const errorText = await response.clone().text().catch(() => '');
          console.warn(`API call failed for ${url}: Status ${response.status}, Error:`, errorText);
          // For other errors, return empty array instead of throwing
          return { items: [] };
        }
        
        const data = await response.json();
        // Log successful responses for debugging (but limit verbosity)
        if (url.includes('/me/tracks') || url.includes('/playlists/') || url.includes('/search')) {
          console.log(`API call succeeded for ${url}:`, {
            hasItems: !!data.items,
            itemsLength: data.items?.length || 0,
            hasPlaylists: !!data.playlists,
            playlistsLength: data.playlists?.items?.length || 0
          });
        }
        return data;
      };

      // Build track pool from 5 sources concurrently
      const trackPromises = [
        // Source 1: Liked Songs
        fetchWithAuthCheck('https://api.spotify.com/v1/me/tracks?limit=50', headers)
          .then(data => data.items || [])
          .catch(err => {
            if (err.message === 'AUTH_EXPIRED') throw err;
            return [];
          }),
        
        // Source 2: Discover Weekly
        fetchWithAuthCheck('https://api.spotify.com/v1/me/playlists?limit=50', headers)
          .then(data => {
            const discoverWeekly = data.items?.find(p => p.name === 'Discover Weekly');
            if (!discoverWeekly) return [];
            return fetchWithAuthCheck(`https://api.spotify.com/v1/playlists/${discoverWeekly.id}/tracks`, headers)
              .then(playlistData => playlistData.items || []);
          })
          .catch(err => {
            if (err.message === 'AUTH_EXPIRED') throw err;
            return [];
          }),
        
        // Source 3: Release Radar
        fetchWithAuthCheck('https://api.spotify.com/v1/me/playlists?limit=50', headers)
          .then(data => {
            const releaseRadar = data.items?.find(p => p.name === 'Release Radar');
            if (!releaseRadar) return [];
            return fetchWithAuthCheck(`https://api.spotify.com/v1/playlists/${releaseRadar.id}/tracks`, headers)
              .then(playlistData => playlistData.items || []);
          })
          .catch(err => {
            if (err.message === 'AUTH_EXPIRED') throw err;
            return [];
          }),
        
        // Source 4: Vibe Playlist 1 (using MOOD_SEARCH_MAP)
        // For Focus mood, search for more lofi playlists (limit=5), otherwise limit=1
        fetchWithAuthCheck(`https://api.spotify.com/v1/search?q=${MOOD_SEARCH_MAP[mood]}&type=playlist&limit=${mood === 'Focus' ? 5 : 1}`, headers)
          .then(async data => {
            const playlists = data.playlists?.items || [];
            if (playlists.length === 0) return [];
            
            // For Focus, fetch tracks from all found playlists, otherwise just the first
            if (mood === 'Focus') {
              const allTracks = [];
              for (const playlist of playlists) {
                try {
                  const playlistData = await fetchWithAuthCheck(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, headers);
                  allTracks.push(...(playlistData.items || []));
                } catch (err) {
                  if (err.message === 'AUTH_EXPIRED') throw err;
                  console.warn('Failed to fetch playlist tracks:', err);
                }
              }
              return allTracks;
            } else {
              return fetchWithAuthCheck(`https://api.spotify.com/v1/playlists/${playlists[0].id}/tracks`, headers)
                .then(playlistData => playlistData.items || []);
            }
          })
          .catch(err => {
            if (err.message === 'AUTH_EXPIRED') throw err;
            return [];
          }),
        
        // Source 5: Vibe Playlist 2 (using mood name)
        // For Focus mood, search for more lofi playlists (limit=5), otherwise limit=2
        fetchWithAuthCheck(`https://api.spotify.com/v1/search?q=${mood === 'Focus' ? 'lofi beats' : mood}&type=playlist&limit=${mood === 'Focus' ? 5 : 2}`, headers)
          .then(async data => {
            const playlists = data.playlists?.items || [];
            if (playlists.length === 0) return [];
            
            // For Focus, fetch tracks from all found playlists, otherwise just the second result
            if (mood === 'Focus') {
              const allTracks = [];
              for (const playlist of playlists) {
                try {
                  const playlistData = await fetchWithAuthCheck(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, headers);
                  allTracks.push(...(playlistData.items || []));
                } catch (err) {
                  if (err.message === 'AUTH_EXPIRED') throw err;
                  console.warn('Failed to fetch playlist tracks:', err);
                }
              }
              return allTracks;
            } else {
              const playlist = playlists[1] || playlists[0]; // Get second result or first if only one
              if (!playlist) return [];
              return fetchWithAuthCheck(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, headers)
                .then(playlistData => playlistData.items || []);
            }
          })
          .catch(err => {
            if (err.message === 'AUTH_EXPIRED') throw err;
            return [];
          }),
      ];

      const results = await Promise.allSettled(trackPromises);
      
      // Check if any promise failed due to auth expiration
      const authExpired = results.some(result => 
        result.status === 'rejected' && result.reason?.message === 'AUTH_EXPIRED'
      );
      
      if (authExpired) {
        sessionStorage.removeItem('spotify_access_token');
        sessionStorage.removeItem('spotify_user_id');
        setAccessToken(null);
        setIsAuthenticated(false);
        clearUserData();
        setError('Your Spotify session has expired. Please login again.');
        setIsLoading(false);
        return;
      }

      // Combine and de-duplicate tracks
      const allTracks = [];
      const sourceNames = ['Liked Songs', 'Discover Weekly', 'Release Radar', 'Vibe Playlist 1', 'Vibe Playlist 2'];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const items = result.value;
          if (!Array.isArray(items)) {
            console.warn(`Source ${index + 1} (${sourceNames[index]}) returned non-array:`, items);
            return;
          }
          console.log(`Source ${index + 1} (${sourceNames[index]}): Found ${items.length} items`);
          let validTracksFromSource = 0;
          items.forEach(item => {
            if (!item) return;
            const track = item.track || item; // Handle both playlist track format and liked track format
            // Check if track is valid (has id)
            if (track && track.id && typeof track.id === 'string') {
              allTracks.push(track);
              validTracksFromSource++;
            } else {
              console.warn(`Source ${index + 1} (${sourceNames[index]}): Invalid track item:`, item);
            }
          });
          console.log(`Source ${index + 1} (${sourceNames[index]}): ${validTracksFromSource} valid tracks extracted`);
        } else {
          // Log rejected promises for debugging
          console.warn(`Track source ${index + 1} (${sourceNames[index]}) failed:`, result.reason);
        }
      });
      
      console.log(`Total tracks collected: ${allTracks.length}`);

      // De-duplicate by track.id
      const trackMap = new Map();
      allTracks.forEach(track => {
        if (!trackMap.has(track.id)) {
          trackMap.set(track.id, track);
        }
      });
      const uniqueTracks = Array.from(trackMap.values());

      if (uniqueTracks.length === 0) {
        // Check if all sources returned empty (likely scope issue)
        const allSourcesEmpty = results.every(result => {
          if (result.status === 'fulfilled') {
            const items = result.value;
            return !Array.isArray(items) || items.length === 0;
          }
          return true; // Rejected promises count as empty
        });
        
        if (allSourcesEmpty) {
          // Check if we have a token but all API calls failed (likely scope issue)
          const storedToken = sessionStorage.getItem('spotify_access_token');
          if (storedToken) {
            // This is likely a scope issue - clear the token so user can re-login with correct scopes
            console.warn('All API calls returned empty - likely scope issue, clearing token');
            sessionStorage.removeItem('spotify_access_token');
            sessionStorage.removeItem('token_saved_at');
            sessionStorage.removeItem('spotify_user_id');
            setAccessToken(null);
            setIsAuthenticated(false);
            clearUserData();
            throw new Error('Insufficient permissions. Please login again to grant access to your library and playlists.');
          }
        }
        throw new Error('No tracks found in your library. Try liking some songs on Spotify!');
      }

      // Special handling for Focus mood: only use tracks from lofi playlists (skip audio feature filtering)
      if (mood === 'Focus') {
        // For Focus, only use tracks from playlist sources (sources 4 and 5)
        // Filter to only include tracks that came from lofi playlist searches
        const lofiTracks = [];
        results.forEach((result, index) => {
          // Only use sources 4 and 5 (lofi playlists)
          if (index === 3 || index === 4) {
            if (result.status === 'fulfilled') {
              const items = result.value;
              if (Array.isArray(items)) {
                items.forEach(item => {
                  if (!item) return;
                  const track = item.track || item;
                  if (track && track.id && typeof track.id === 'string') {
                    lofiTracks.push(track);
                  }
                });
              }
            }
          }
        });

        // De-duplicate lofi tracks
        const lofiTrackMap = new Map();
        lofiTracks.forEach(track => {
          if (!lofiTrackMap.has(track.id)) {
            lofiTrackMap.set(track.id, track);
          }
        });
        const uniqueLofiTracks = Array.from(lofiTrackMap.values());

        if (uniqueLofiTracks.length === 0) {
          throw new Error('No lofi tracks found. Try searching for "Lofi Beats" playlists on Spotify!');
        }

        // Filter out blocked songs and select random track
        const currentBlocked = blockedSongs[mood] || [];
        const unblockedLofiTracks = uniqueLofiTracks.filter(track => !currentBlocked.includes(track.id));
        
        if (unblockedLofiTracks.length === 0) {
          throw new Error("All lofi tracks are blocked. Try unblocking some or searching for more lofi playlists!");
        }
        
        const randomTrack = unblockedLofiTracks[Math.floor(Math.random() * unblockedLofiTracks.length)];
        setTrackId(randomTrack.id);
        addMoodToHistory(mood);
        setIsLoading(false);
        return;
      }

      // For other moods, continue with audio feature filtering
      // Get track IDs and fetch audio features (batch in groups of 100)
      const trackIds = uniqueTracks.map(t => t.id);
      const allFeatures = [];
      
      for (let i = 0; i < trackIds.length; i += 100) {
        const batch = trackIds.slice(i, i + 100);
        try {
          const featuresData = await fetchWithAuthCheck(
            `https://api.spotify.com/v1/audio-features?ids=${batch.join(',')}`,
            headers
          );
          
          if (featuresData.audio_features) {
            allFeatures.push(...featuresData.audio_features.filter(f => f !== null));
          }
        } catch (err) {
          if (err.message === 'AUTH_EXPIRED') {
            throw err;
          }
          console.warn('Failed to fetch audio features:', err);
        }
      }

      // Create a map of track ID to features
      const featuresMap = new Map();
      allFeatures.forEach(feature => {
        if (feature && feature.id) {
          featuresMap.set(feature.id, feature);
        }
      });

      // Get vibe profile (user's learned profile or default)
      const profile = userVibeProfiles[mood] || VIBE_PROFILES[mood];

      if (!profile) {
        throw new Error(`No vibe profile found for mood: ${mood}`);
      }

      // Filter tracks by vibe profile
      // Use lenient matching for default profiles (require 50% of conditions), strict for user-learned profiles
      const isUserLearnedProfile = !!userVibeProfiles[mood];
      let filteredTracks = uniqueTracks.filter(track => {
        const features = featuresMap.get(track.id);
        if (!features) return false;

        let passedConditions = 0;
        let totalConditions = 0;

        // Check against profile (handle both min/max and target properties)
        for (const key in profile) {
          const targetValue = profile[key];
          totalConditions++;
          let conditionPassed = false;
          
          if (key.startsWith('target_')) {
            // For target properties, use a tolerance range (±0.2)
            const featureName = key.replace('target_', '');
            const featureValue = features[featureName];
            if (featureValue !== null && featureValue !== undefined) {
              if (Math.abs(featureValue - targetValue) <= 0.2) {
                conditionPassed = true;
              }
            }
          } else if (key.startsWith('min')) {
            const propertyName = key.substring(3).toLowerCase();
            const featureValue = features[propertyName];
            if (featureValue !== null && featureValue !== undefined && featureValue >= targetValue) {
              conditionPassed = true;
            }
          } else if (key.startsWith('max')) {
          const propertyName = key.substring(3).toLowerCase();
            const featureValue = features[propertyName];
            if (featureValue !== null && featureValue !== undefined && featureValue <= targetValue) {
              conditionPassed = true;
            }
          }
          
          if (conditionPassed) {
            passedConditions++;
          } else if (isUserLearnedProfile) {
            // For user-learned profiles, require ALL conditions to pass
            return false;
          }
        }
        
        // For default profiles, require at least 50% of conditions to pass
        if (!isUserLearnedProfile) {
          return passedConditions >= Math.ceil(totalConditions / 2);
        }
        
        // For user-learned profiles, all conditions must pass (already checked above)
        return true;
      });

      // Filter out blocked songs
      const currentBlocked = blockedSongs[mood] || [];
      let unblockedTracks = filteredTracks.filter(track => !currentBlocked.includes(track.id));

      // Fallback: If no tracks match the vibe profile, use a looser filter or just use all tracks
      if (unblockedTracks.length === 0) {
        console.warn('No tracks matched strict vibe profile, using looser filter');
        
        // Try with looser tolerance for target properties (±0.3 instead of ±0.2)
        if (userVibeProfiles[mood]) {
          filteredTracks = uniqueTracks.filter(track => {
            const features = featuresMap.get(track.id);
            if (!features) return false;
            
            for (const key in profile) {
              if (key.startsWith('target_')) {
                const featureName = key.replace('target_', '');
                const featureValue = features[featureName];
                if (featureValue !== null && featureValue !== undefined) {
                  if (Math.abs(featureValue - profile[key]) > 0.3) {
                    return false;
                  }
                }
              }
            }
            return true;
          });
          unblockedTracks = filteredTracks.filter(track => !currentBlocked.includes(track.id));
        }
        
        // If still no tracks, use all tracks with features (just filter out blocked)
        if (unblockedTracks.length === 0) {
          console.warn('Still no tracks matched, using all available tracks');
          unblockedTracks = uniqueTracks.filter(track => 
            featuresMap.has(track.id) && !currentBlocked.includes(track.id)
          );
        }
        
        // Final fallback: use all tracks (even without features)
        if (unblockedTracks.length === 0) {
          console.warn('Using all tracks as final fallback');
          unblockedTracks = uniqueTracks.filter(track => !currentBlocked.includes(track.id));
        }
        
        if (unblockedTracks.length === 0) {
          throw new Error("No songs available. Try 'liking' more songs on Spotify to build your library!");
        }
      }

      // Select random track
      const randomTrack = unblockedTracks[Math.floor(Math.random() * unblockedTracks.length)];
      setTrackId(randomTrack.id);
      addMoodToHistory(mood);
    } catch (err) {
      console.error('Spotify API Error:', err);
      
      if (err.message === 'AUTH_EXPIRED' || err.message.includes('401') || err.message.includes('403')) {
        // Token expired - but check if it's a fresh token first
        const tokenAge = sessionStorage.getItem('token_saved_at');
        const now = Date.now();
        const isFreshToken = tokenAge && (now - parseInt(tokenAge)) < 5000; // Less than 5 seconds old
        
        if (isFreshToken) {
          console.warn('Got auth error on fresh token - might be scope issue, NOT clearing token');
          setError('Authentication error. Please make sure you granted all required permissions when logging in.');
        } else {
          // Token expired
          sessionStorage.removeItem('spotify_access_token');
          sessionStorage.removeItem('token_saved_at');
          setAccessToken(null);
          setIsAuthenticated(false);
          setError('Your Spotify session has expired. Please login again.');
        }
      } else {
        setError(err.message || 'An unexpected error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Like button - now fetches audio features and trains profile
  const handleLike = async () => {
    if (!currentMood || !trackId || !accessToken) return;

    try {
      // Fetch audio features for this track
      const response = await fetch(
        `https://api.spotify.com/v1/audio-features/${trackId}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (response.ok) {
        const features = await response.json();
        
        // Store features and update profile
        updateUserVibeProfile(currentMood, features);
      }

      // Also add to liked songs list
      setLikedSongs(prev => {
        const moodLikes = prev[currentMood] || [];
        if (!moodLikes.includes(trackId)) {
          return { ...prev, [currentMood]: [...moodLikes, trackId] };
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to fetch audio features:', err);
      // Still add to liked songs even if features fetch fails
    setLikedSongs(prev => {
      const moodLikes = prev[currentMood] || [];
      if (!moodLikes.includes(trackId)) {
        return { ...prev, [currentMood]: [...moodLikes, trackId] };
      }
      return prev;
    });
    }
  };

  // Handle Dislike button
  const handleDislike = () => {
    if (!currentMood || !trackId) return;

    // Add the trackId to the blocked list for the current mood
    setBlockedSongs(prev => {
      const moodBlocks = prev[currentMood] || [];
      if (!moodBlocks.includes(trackId)) {
        return { ...prev, [currentMood]: [...moodBlocks, trackId] };
      }
      return prev;
    });

    // Immediately re-roll a new song
    getPersonalizedSongForMood(currentMood);
  };

  // Spotify Mood Player Component
  const spotifyPlayer = (
    <div className="spotify-player-container">
      <h2 className="spotify-title">Spotify Mood Player</h2>
      
      {(() => {
        // Check token directly as fallback (in case useEffect hasn't synced yet)
        const storedToken = sessionStorage.getItem('spotify_access_token');
        const isLoggedIn = isAuthenticated || !!storedToken;
        
        return !isLoggedIn ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <p style={{ color: '#FFFFFF', marginBottom: '20px' }}>
              Login to Spotify to get personalized song recommendations based on your library!
            </p>
            <button onClick={redirectToSpotifyLogin} className="mood-button">
              Login with Spotify
            </button>
          </div>
        ) : (
        <>
      {/* Mood Buttons */}
      <div className="mood-buttons-container">
        {MOODS.map((mood) => (
          <button
            key={mood}
                onClick={() => getPersonalizedSongForMood(mood)}
            disabled={isLoading}
            className="mood-button"
          >
            {mood}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {isLoading && (
        <p className="loading-message">Finding a song...</p>
      )}

      {/* Error State */}
      {error && (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <p className="error-message">Error: {error}</p>
          {error.includes('Insufficient permissions') && (
            <button onClick={redirectToSpotifyLogin} className="mood-button" style={{ marginTop: '10px' }}>
              Login with Spotify
            </button>
          )}
        </div>
      )}

      {/* Spotify Embed Player */}
      {trackId && (
        <div className="spotify-embed-container">
          <iframe
            src={`https://open.spotify.com/embed/track/${trackId}`}
            width="100%"
            height="380"
            frameBorder="0"
            allowtransparency="true"
            allow="encrypted-media"
            title="Spotify Player"
            className="spotify-iframe"
          ></iframe>
        </div>
      )}

      {/* Like/Dislike Buttons */}
      {trackId && !isLoading && (
        <div className="feedback-buttons">
          <button 
            onClick={handleLike} 
            className="feedback-button feedback-button-like"
            title="Like this song"
          >
            👍
          </button>
          <button 
            onClick={handleDislike} 
            className="feedback-button feedback-button-dislike"
            title="Dislike this song"
          >
            👎
          </button>
        </div>
      )}
        </>
        );
      })()}
    </div>
  );

  return (
    <div className="App">
      <BrowserRouter>
        <SpotifyCallback />
        <Navbar />
        <div className="content">
          <Routes>
            <Route path="/" element={<Home spotifyPlayer={spotifyPlayer} moodHistory={moodHistory} />} />
            <Route path="/recommend" element={<ArtistRecommender />} />
            <Route path="/rolodex" element={<Rolodex />} />
            <Route path="/order" element={<WhatsMyOrder />} />
          </Routes>
        </div>
      </BrowserRouter>
    </div>
  );
}

export default App;
