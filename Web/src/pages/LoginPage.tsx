import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import AuthForm from '../components/Auth/AuthForm';
import AuthHeader from '../components/Layout/Header';
import './AuthPages.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: Record<string, string | boolean>) => {
    setError('');
    setLoading(true);

    try {
      await login(values.email as string, values.password as string);
      navigate('/projects');
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthHeader 
        linkText="Don't have an account?" 
        linkTo="/register" 
        linkLabel="Sign Up" 
      />

      <div className="auth-content">
        <div className="auth-card">
          <div className="auth-card-header">
            <h1 className="auth-title">Welcome Back</h1>
            <p className="auth-subtitle">
              Sign in to access your BIM projects
            </p>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <AuthForm type="login" onSubmit={handleSubmit} isLoading={loading} />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
