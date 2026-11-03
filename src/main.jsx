import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// No <StrictMode>: its dev-only double mount would start two interview sessions.
createRoot(document.getElementById('root')).render(<App />);
