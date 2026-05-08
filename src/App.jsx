import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Hooks & Store
import { useAuthSync } from './hooks/useAuthSync';
import { useAuthStore } from './store';

// Layouts
import RootLayout from './layout/RootLayout';
import DashboardLayout from './layout/DashboardLayout';

// Components
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';

// Páginas Públicas
import Login from './pages/Login';
import Register from './pages/Register';
import RefereeAccess from './pages/RefereeAccess';
import RefereeScoreboard from './pages/RefereeScoreboard';

// Páginas del Dashboard
import Dashboard from './pages/Dashboard';
import TeamRegistration from './pages/TeamRegistration';
import MatchesView from './pages/MatchesView';
import StandingsView from './pages/StandingsView';

// Páginas de Administración
import AdminDashboard from './pages/admin/AdminDashboard';
import TeamManagement from './pages/admin/TeamManagement';
import AdminTeamEditor from './pages/admin/AdminTeamEditor';
import AdminMVPLeaderboard from './pages/admin/AdminMVPLeaderboard';
import PlayoffManager from './pages/admin/PlayoffManager';
import TournamentConfig from './pages/admin/TournamentConfig';
import TournamentDraw from './pages/admin/TournamentDraw';
import AdminMatches from './pages/admin/AdminMatches';
import AdminMediaManager from './pages/admin/AdminMediaManager';
import AdminAnnouncements from './pages/admin/AdminAnnouncements';

export default function App() {
  useAuthSync();
  const { isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-primary)', color: 'var(--volley-gold)', fontSize: '1.2rem', fontFamily: 'var(--font-body)' }}>
        🏐 Inicializando VoleyTournament...
      </div>
    );
  }

  return (
    <RootLayout>
      <BrowserRouter>
        <Routes>
          {/* ==================== RUTAS PÚBLICAS ==================== */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/arbitro" element={<RefereeAccess />} />
          <Route path="/arbitro/partido/:matchId" element={<RefereeScoreboard />} />

          {/* ==================== RUTAS PROTEGIDAS ==================== */}
          <Route element={<ProtectedRoute />}>
            <Route path="/*" element={<DashboardLayout />}>
              
              {/* --- RUTAS DE USUARIO / ESPECTADOR --- */}
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="dashboard/partidos" element={<MatchesView />} />
              <Route path="dashboard/clasificacion" element={<StandingsView />} />
              
              {/* --- RUTAS SOLO PARA EQUIPOS REGISTRADOS --- */}
              <Route path="dashboard/inscripcion" element={<TeamRegistration />} />
              
              {/* --- RUTAS SOLO PARA ADMINISTRADORES --- */}
              <Route element={<AdminRoute />}>
                <Route path="admin" element={<AdminDashboard />} />
                <Route path="admin/teams" element={<TeamManagement />} />
                <Route path="admin/teams/edit/:teamId" element={<AdminTeamEditor />} />
                <Route path="admin/mvp" element={<AdminMVPLeaderboard />} />
                <Route path="admin/playoffs" element={<PlayoffManager />} />
                <Route path="admin/config" element={<TournamentConfig />} />
                <Route path="admin/draw" element={<TournamentDraw />} />
                <Route path="admin/matches" element={<AdminMatches />} />
                <Route path="admin/media" element={<AdminMediaManager />} />
                <Route path="admin/announcements" element={<AdminAnnouncements />} />
              </Route>
              
              {/* Redirección por defecto */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
              
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </RootLayout>
  );
}