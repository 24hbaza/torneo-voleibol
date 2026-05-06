// src/components/ProtectedRoute.jsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store';

export default function ProtectedRoute() {
  const { isAuthenticated, profile, isLoading } = useAuthStore();
  const location = useLocation();

  // 1. Estado de carga inicial (mientras Supabase responde)
  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh',
        background: 'var(--bg-primary)', color: 'var(--volley-gold)', fontSize: '1.2rem'
      }}>
        🏐 Verificando sesión...
      </div>
    );
  }

  // 2. No autenticado → Redirigir a Login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. Autenticado pero SIN registro completado
  // Consideramos "incompleto" si no tiene team_name (campo clave del cuestionario)
  const needsRegistration = !profile?.team_name;
  
  if (needsRegistration) {
    // Si intenta acceder a cualquier ruta que NO sea la inscripción, forzar redirección
    if (location.pathname !== '/dashboard/inscripcion') {
      return <Navigate to="/dashboard/inscripcion" replace />;
    }
    // Si ya está en la página de inscripción, permitir acceso para que rellene el formulario
  }

  // 4. Todo correcto → Renderizar las rutas hijas (DashboardLayout + subrutas)
  return <Outlet />;
}