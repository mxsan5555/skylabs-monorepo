import './app.css';
import { Route, Routes } from 'react-router-dom';
import Showcase from './showcase';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Showcase />} />
    </Routes>
  );
}

export default App;
