import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { FaFolderOpen,  FaSignOutAlt } from 'react-icons/fa';
import Logo from '/Logo.svg';
import './Sidebar.css';

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <img src={Logo} alt="BIM Analyst Logo" />
        </div>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item ${location.pathname === '/projects' ? 'active' : ''}`}
          onClick={() => navigate('/projects')}
          title="Projects"
        >
          <FaFolderOpen className="nav-icon" />
          <span className="nav-label">Projects</span>
        </button>

       
      </nav>

      <div className="sidebar-footer">
        {user && (
          <div className="user-info" title={user.email}>
            <span className="user-avatar">
              {user.fullName.charAt(0).toUpperCase()}
            </span>
            <span className="user-name">{user.fullName}</span>
          </div>
        )}
        
        <button
          className="nav-item logout-btn"
          onClick={handleLogout}
          title="Logout"
        >
          <FaSignOutAlt className="nav-icon" />
          <span className="nav-label">Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
