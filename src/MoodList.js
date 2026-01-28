const MoodList = ({moods, handleChoose}) => {


    return ( 
        <div className="mood-list">
            {moods.map((mood) => (
                <div className="mood-preview" key={mood.id}>
                <h2>{mood.title}</h2>
                <button 
                    className = "styled-button"
                    onClick = {() => handleChoose(mood.id)}> Choose Mood </button>
                </div>
            ))}
        </div>
     );
}
 
export default MoodList;