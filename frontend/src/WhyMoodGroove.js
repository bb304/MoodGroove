import React from 'react';

const WhyMoodGroove = () => {
    return (
        <div className="why-mood-groove">
            <h3 className="about-title">About Mood Groove</h3>
            <div className="about-content">
                <p className="about-intro">
                    I created Mood Groove as a way to connect a person's mood with music.
                </p>
                <p className="about-body">
                    I have always found myself searching for the perfect song to match my mood,
                    so I created Mood Groove to eliminate that search. It has never been easier to find the perfect song for your mood.
                </p>
                <div className="about-features">
                    <h4>Features</h4>
                    <ul>
                        <li>🎵 Smart playlist search</li>
                        <li>🎲 Double-random song selection</li>
                        <li>📊 Mood history tracking</li>
                        <li>🎧 Instant Spotify playback</li>
                    </ul>
                </div>
                <p className="about-footer">
                    Simply select your mood and let Mood Groove find the perfect soundtrack for your day!
                </p>
            </div>
        </div>
    );
}

export default WhyMoodGroove;