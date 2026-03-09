import { useState, useEffect, type ReactNode } from 'react';
import api from '../services/api';
import { AuthContext, type User } from './AuthContext.context';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for stored token on mount
    const storedToken = localStorage.getItem('token');
    
    if (storedToken) {
      setToken(storedToken);
      api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
    }
    
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.post('auth/login', { email, password });
    const { accessToken, refreshToken, user: newUser } = response.data.data;
    
    setToken(accessToken);
    setUser(newUser);
    
    localStorage.setItem('token', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    
    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
  };

  const register = async (name: string, email: string, password: string) => {
    const response = await api.post('auth/register', { 
      email, 
      password, 
      fullName: name 
    });
    const { accessToken, refreshToken, user: newUser } = response.data.data;
    
    setToken(accessToken);
    setUser(newUser);
    
    localStorage.setItem('token', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    
    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    delete api.defaults.headers.common['Authorization'];
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        token, 
        login, 
        register, 
        logout, 
        isAuthenticated: !!token 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
