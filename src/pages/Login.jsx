// src/pages/Login.jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store';
import AuthLayout from '../layout/AuthLayout';
import { Input, Button } from '../design-system/components';
import styles from './Login.module.css';

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      setAuth({ user: data.user, profile: profile || null });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Iniciar Sesión" subtitle="Accede a tu equipo y gestiona tus partidos">
      {error && <div className={styles.errorBox}>⚠️ {error}</div>}
      
      <form onSubmit={handleLogin} className={styles.form}>
        <Input
          label="Email del equipo"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="capitan@equipo.com"
          required
          iconLeft="📧"
        />
        
        <Input
          label="Contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          iconLeft="🔒"
        />

        <Button type="submit" loading={loading} fullWidth>
          Entrar al Panel
        </Button>
      </form>

      <div className={styles.footerLink}>
        ¿No tienes cuenta? <Link to="/register">Registra tu equipo</Link>
      </div>
    </AuthLayout>
  );
}