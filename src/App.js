import Navbar from './Navbar';
import Home from './Home';

function App() {
  //const title = "Welcome to the new blog";
  //const likes = 50;
  //const link = "https://www.youtube.com/watch?v=pnhO8UaCgxg&list=PL4cUxeGkcC9gZD-Tvwfod2gaISzfRiP9d&index=4";
  return (
    <div className="App">
      <Navbar />
      <div className="content">
        <Home/>
      </div>
    </div>
  );
}

export default App;
