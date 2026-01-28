const Navbar = () => {
    return (
        <>
            <header>
                <div className="logo">
                    <img src="/Logo.png" alt="MoodGroove Logo"  className = "logo-img"/>
                </div>
            </header>
            <nav className="navbar">
                <h1>MoodGroove</h1>
                <div className="links">
                    <a href="/">Home</a>
                    <a href="/create" style={{
                        color: "white",
                        backgroundColor: '#5D3FD3',
                        borderRadius: '8px'
                    }}>New Groove</a>
                </div>
            </nav>
        </>
    );
}

export default Navbar;