import React from 'react';

const MoodHistory = ({ history }) => {
    return (
        <div className="mood-history">
            <h3 className="history-title">Mood History</h3>
            {history.length === 0 ? (
                <div className="history-empty">
                    <p>No moods selected yet</p>
                    <p className="history-hint">Select a mood to start tracking!</p>
                </div>
            ) : (
                <div className="history-list">
                    {history.map((entry, index) => (
                        <div key={index} className="history-item">
                            <div className="history-mood">{entry.mood}</div>
                            <div className="history-time">{entry.timestamp}</div>
                            <div className="history-date">{entry.date}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default MoodHistory;