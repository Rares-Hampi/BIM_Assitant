import { useNavigate } from 'react-router-dom';
import { FaCheckCircle } from 'react-icons/fa';
import Sidebar from '../components/Layout/Sidebar';
import './HomePage.css';

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      <Sidebar />

      <div className="home-content">
        <div className="home-hero">
          <h1 className="hero-title">
            Lorem ipsum is simply<br />
            dummy text of the printing
          </h1>
          
          <div className="hero-badge">
            <FaCheckCircle className="badge-icon" />
            <span className="badge-text">Detectie clash-uri in timp real</span>
          </div>
          
          <p className="hero-subtitle">Afisare modele</p>

          <div className="hero-mockup">
            {/* Mockup illustration area */}
            <div className="mockup-placeholder">
              <div className="mockup-screens">
                <div className="mockup-screen mockup-screen-1"></div>
                <div className="mockup-screen mockup-screen-2"></div>
              </div>
            </div>
          </div>

          <div className="hero-actions">
            <button 
              className="btn btn-primary"
              onClick={() => navigate('/login')}
            >
              Get Started
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => navigate('/register')}
            >
              Sign Up
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
