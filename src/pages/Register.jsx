// src/pages/Register.jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import AuthLayout from '../layout/AuthLayout';
import { Input, Button } from '../design-system/components';
import styles from './Register.module.css';

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      setLoading(false);
      return;
    }

    try {
      const { error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) throw authError;
      
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.message || 'Error al registrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Crear Cuenta" subtitle="Registra a tu capitán para comenzar la inscripción">
      {error && <div className={styles.errorBox}>⚠️ {error}</div>}
      {success && <div className={styles.successBox}>✅ ¡Registro exitoso! Redirigiendo al login...</div>}

      <form onSubmit={handleRegister} className={styles.form}>
        <Input
          label="Email del capitán"
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
          placeholder="Mínimo 6 caracteres"
          minLength={6}
          required
          iconLeft="🔒"
        />

        <Input
          label="Confirmar Contraseña"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Repite la contraseña"
          required
          iconLeft="🔐"
        />

        <Button type="submit" loading={loading} fullWidth>
          Crear Cuenta
        </Button>
      </form>

      <div className={styles.footerLink}>
        ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
      </div>
    </AuthLayout>
  );
}