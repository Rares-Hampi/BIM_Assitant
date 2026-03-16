import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import AuthForm from '../components/Auth/AuthForm';
import AuthHeader from '../components/Layout/Header';
import './AuthPages.css';

const RegisterPage = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: Record<string, string | boolean>) => {
    setError('');
    setLoading(true);

    try {
      await register(
        values.name as string,
        values.email as string,
        values.password as string
      );
      navigate('/projects');
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(
        error.response?.data?.message || 'Registration failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthHeader 
        linkText="Already have an account?" 
        linkTo="/login" 
        linkLabel="Log In" 
      />

      <div className="auth-content">
        <div className="auth-card">
          <div className="auth-card-header">
            <h1 className="auth-title">Create Account</h1>
            <p className="auth-subtitle">
              Join the next generation of building information modeling
            </p>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <AuthForm type="register" onSubmit={handleSubmit} isLoading={loading} />
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
