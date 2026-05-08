import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store';

export default function AdminRoute() {
  const { profile, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          color: 'var(--volley-gold)',
          background: 'var(--bg-primary)',
          fontFamily: 'var(--font-body)',
          fontSize: '1.1rem',
        }}
      >
        🔐 Verificando permisos de administrador...
      </div>
    );
  }

  // Solo admins pueden acceder
  if (!profile?.is_admin) {
    return <Navigate to="/dashboard" state={{ from: location }} replace />;
  }

  // ✅ CLAVE: En React Router v6, las rutas hijas se renderizan con Outlet
  return <Outlet />;
}