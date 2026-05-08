import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// ... tus imports ...

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
      {/* ✅ CLAVE: basename dinámico que lee la configuración de Vite */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          {/* ... tus rutas (sin cambios) ... */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/arbitro" element={<RefereeAccess />} />
          <Route path="/arbitro/partido/:matchId" element={<RefereeScoreboard />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/*" element={<DashboardLayout />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="dashboard/partidos" element={<MatchesView />} />
              <Route path="dashboard/clasificacion" element={<StandingsView />} />
              <Route path="dashboard/inscripcion" element={<TeamRegistration />} />
              
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
              
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </RootLayout>
  );
}