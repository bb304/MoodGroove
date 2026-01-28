import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

const Navbar = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const navigate = useNavigate();

    // Check authentication state
    useEffect(() => {
        const checkAuth = () => {
            const token = sessionStorage.getItem('spotify_access_token');
            setIsAuthenticated(!!token);
        };

        checkAuth();

        // Listen for storage changes
        const handleStorageChange = (e) => {
            if (e.key === 'spotify_access_token') {
                checkAuth();
            }
        };
        window.addEventListener('storage', handleStorageChange);

        // Check periodically for same-tab changes
        const intervalId = setInterval(checkAuth, 1000);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(intervalId);
        };
    }, []);

    const handleLogout = () => {
        // Clear all authentication data
        sessionStorage.removeItem('spotify_access_token');
        sessionStorage.removeItem('spotify_user_id');
        sessionStorage.removeItem('spotify_intended_route');
        sessionStorage.removeItem('pkce_code_verifier');
        sessionStorage.removeItem('processed_auth_code');
        sessionStorage.removeItem('spotify_redirect_uri');
        
        // Update state
        setIsAuthenticated(false);
        
        // Redirect to home page
        navigate('/');
        
        // Reload the page to clear all component state
        window.location.reload();
    };

    return (
        <>
            <header>
                <div className="logo">
                    <img src="/Logo.png" alt="MoodGroove Logo" className="logo-img"/>
                </div>
                {isAuthenticated && (
                    <button onClick={handleLogout} className="logout-button">
                        Logout
                    </button>
                )}
            </header>
            <nav className="navbar">
                <h1 className="navbar-title">MoodGroove</h1>
                <div className="links">
                    <NavLink to="/" className={({ isActive }) => isActive ? "nav-link nav-link-active" : "nav-link"}>
                        Home
                    </NavLink>
                    <NavLink to="/recommend" className={({ isActive }) => isActive ? "nav-link nav-link-active" : "nav-link"}>
                        Artist Vibe
                    </NavLink>
                    <NavLink to="/rolodex" className={({ isActive }) => isActive ? "nav-link nav-link-active" : "nav-link"}>
                        My Rolodex
                    </NavLink>
                    <NavLink to="/order" className={({ isActive }) => isActive ? "nav-link nav-link-active" : "nav-link"}>
                        What's My Order
                    </NavLink>
                </div>
            </nav>
        </>
    );
}

export default Navbar;