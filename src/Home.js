import { useState } from 'react';
import MoodList from './MoodList';

const Home = () => {
    //let name = "Ben";
    const [moods, setMoods] = useState([
        { title: 'Happy :)', id: 1 },
        { title: 'Sad :(', id: 2 },
        { title: 'Mysterious ; >', id: 3 }
    ])

    const [txt, setTxt] = useState('This will do something soon');
    

    const handleClick = (e) => {
        setTxt("This doesn't do anything yet");
    }

    const handleChoose = (id) => {
        const newMoods = moods.filter(mood => mood.id === id);
        setMoods(newMoods);
    }


    return (
        <div className="home">
            <h2>Homepage</h2>
            <p>{txt}</p>
            <button 
                className = "styled-button"
                onClick = {handleClick}>Click me
            </button>
            <MoodList moods = {moods} handleChoose = {handleChoose}/>
        </div>
    );
}
 
export default Home;
