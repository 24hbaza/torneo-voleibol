// src/components/AdminRoute.jsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store';

export default function AdminRoute() {
  const { profile, isLoading } = useAuthStore();

  // Mientras carga el perfil, muestra un indicador
  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh',
        background: 'var(--bg-primary)', color: 'var(--volley-gold)', fontSize: '1.2rem'
      }}>
        🔒 Verificando permisos de administrador...
      </div>
    );
  }

  // ✅ Solo permite acceso si el perfil tiene is_admin = true
  if (profile?.is_admin === true) {
    return <Outlet />;
  }

  // ❌ Si no es admin, redirige silenciosamente al dashboard normal
  return <Navigate to="/dashboard" replace />;
}