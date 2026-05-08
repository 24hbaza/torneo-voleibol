import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store';
import { useGuestMode } from '../hooks/useGuestMode';
import AuthLayout from '../layout/AuthLayout';
import { Input, Button } from '../design-system/components';
import styles from './Login.module.css';

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { enableGuest } = useGuestMode();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ✅ Manejador blindado: Cierra sesión activa ANTES de entrar como espectador
  const handleGuestAccess = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      clearAuth();
      localStorage.removeItem('voley_guest');
      window.dispatchEvent(new Event('guestModeChanged'));
      
      enableGuest();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('Error al entrar como espectador:', err);
      setError('No se pudo activar el modo espectador. Intenta recargar.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      // ✅ Limpiar modo espectador INMEDIATAMENTE
      localStorage.removeItem('voley_guest');
      window.dispatchEvent(new Event('guestModeChanged'));

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError) {
        console.warn('Perfil no encontrado, continuando sin perfil:', profileError.message);
      }

      setAuth({ user: data.user, profile: profile || null });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Acceso al Torneo" subtitle="Gestiona tu equipo o sigue la competición en tiempo real">
      
      {/* SECCIÓN INFORMATIVA SUPERIOR */}
      <div className={styles.infoGrid}>
        <div className={styles.infoCard}>
          <span className={styles.infoIcon}>📝</span>
          <h3>¿Quieres inscribir un equipo?</h3>
          <p>Crea una cuenta de capitán para gestionar tu plantilla, subir documentos y controlar tus partidos.</p>
          <Link to="/register" className={styles.infoLink}>Ir a Registro →</Link>
        </div>
        
        <div className={styles.infoCard}>
          <span className={styles.infoIcon}>👁️</span>
          <h3>¿Solo quieres ver el torneo?</h3>
          <p>Accede al modo espectador para ver calendarios, clasificaciones, galería y noticias sin registrarte.</p>
          <button 
            type="button" 
            onClick={handleGuestAccess} 
            className={styles.infoBtn}
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar como Espectador'}
          </button>
        </div>
      </div>

      {/* FORMULARIO DE LOGIN */}
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