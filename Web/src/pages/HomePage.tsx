import { useNavigate } from 'react-router-dom';
import AuthHeader from '../components/Layout/Header';
import './HomePage.css';
import { useAuth } from '../hooks/useAuth';

const HomePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="home-page">
      {/* Header */}
      <AuthHeader 
        isButton={true}
        buttonText={user ? "Projects" : "Login"}
        onButtonClick={() => navigate(user ? '/projects' : '/login')}
      />

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-left">
            <div className="hero-tag">
              <span className="tag-dot"></span>
               BIM ASSISTANT
            </div>
            
            <h1 className="hero-title">
              Advanced BIM<br />
              Conversion &<br />
              Clash<br />
              Detection
            </h1>
            
            <p className="hero-description">
              Transform complex architectural designs into high-fidelity 3D models with our advanced conversion and automated clash detection engine.
            </p>
            
            <div className="hero-actions">
              <button className="btn-primary" onClick={() => navigate('/register')}>
                Get Started
              </button>
             
            </div>
          </div>
          
          <div className="hero-right">
            <div className="hero-image-container">
              <img 
                src="https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=800" 
                alt="Architect working on plans" 
                className="hero-image"
              />
              <div className="hero-card">
                <div className="card-label">ACTIVE MODEL</div>
                <div className="card-title">Skyline Plaza_V4</div>
                <div className="card-badges">
                  <span className="badge">Files: 4</span>
                  <span className="badge">Clashes: 12</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
