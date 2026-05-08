import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store';
import { useGuestMode } from '../hooks/useGuestMode';

export default function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const { isGuest } = useGuestMode();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-primary)', color: 'var(--volley-gold)', fontFamily: 'var(--font-body)', fontSize: '1.1rem' }}>
        🏐 Verificando acceso...
      </div>
    );
  }

  const hasAccess = isAuthenticated || isGuest;

  if (!hasAccess) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isGuest) {
    const allowedPaths = ['/dashboard', '/dashboard/partidos', '/dashboard/clasificacion'];
    const isAllowed = allowedPaths.some(p => 
      location.pathname === p || location.pathname.startsWith(p + '/')
    );
    
    if (!isAllowed) {
      return <Navigate to="/dashboard/partidos" replace />;
    }
  }

  // ✅ CLAVE: Solo renderiza las rutas hijas. La validación de inscripción se maneja en Dashboard.
  return <Outlet />;
}