import MoodHistory from './MoodHistory';
import WhyMoodGroove from './WhyMoodGroove';

const Home = ({ spotifyPlayer, moodHistory }) => {
    return (
        <div className="home">
            {/* Left section: why we created Mood Groove */}
            <div className="explanation">
                <WhyMoodGroove />
            </div>
            {/* Main content section - Spotify Player */}
            <div className="main-content">
                {spotifyPlayer}
            </div>
            {/* Right section: mood history */}
            <div className="sidebar">
                <MoodHistory history={moodHistory} />
            </div>
        </div>
    );
}

export default Home;