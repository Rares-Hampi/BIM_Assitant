import { Link } from "react-router-dom";
import city from "../../../public/City.png";
import { useNavigate } from 'react-router-dom';
import "./Header.css";
import { useAuth } from "../../hooks/useAuth";

interface HeaderProps {
  linkText?: string;
  linkTo?: string;
  linkLabel?: string;
  onButtonClick?: () => void;
  buttonText?: string;
  isButton?: boolean;
}

const Header = ({
  linkText,
  linkTo,
  linkLabel,
  onButtonClick,
  buttonText,
  isButton = false,
}: HeaderProps) => {

  const { logout } = useAuth();
  const navigate = useNavigate();

   const handleLogout = () => {
    logout();
    navigate('/login');
  };
  return (
    <header className="auth-header">
      <div className="auth-header-content">
        <Link to="/" className="logo-link">
          <div className="header-logo">
            <img src={city} alt="BIM Assistant Logo" className="logo-icon" />
            <span className="logo-text">BIM ASSISTANT</span>
          </div>{" "}
        </Link>

        <div className="auth-header-link">
          {isButton && buttonText ? (
            <button className="btn-login" onClick={onButtonClick || handleLogout}>
              {buttonText}
            </button>
          ) : (
            linkText &&
            linkTo &&
            linkLabel && (
              <>
                {linkText} <Link to={linkTo}>{linkLabel}</Link>
              </>
            )
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
