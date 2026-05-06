// src/pages/MatchesView.jsx
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store';
import MatchCard from '../features/matches/components/MatchCard';
import styles from './MatchesView.module.css';

export default function MatchesView() {
  const { profile } = useAuthStore();
  const [activeTab, setActiveTab] = useState('my'); // 'my' | 'all'
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ Carga inicial + Realtime (auto-refresh de marcadores)
  useEffect(() => {
    const fetchMatches = async () => {
      setLoading(true);
      const response = await supabase
        .from('matches')
        .select(`
          id, match_date, status, home_score, away_score, court_number, 
          verification_code, referee_team_id, current_set, 
          live_points_home, live_points_away,
          home:profiles!matches_home_team_id_fkey(id, team_name, badge_url),
          away:profiles!matches_away_team_id_fkey(id, team_name, badge_url),
          referee:profiles!matches_referee_team_id_fkey(id, team_name)
        `)
        .order('match_date', { ascending: false });
      
      const data = response.data;
      if (data) setMatches(data);
      setLoading(false);
    };

    fetchMatches();

    // ✅ Suscripción Realtime: actualiza automáticamente cuando cambia cualquier partido
    const channel = supabase
      .channel('matches_live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        fetchMatches
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // ✅ Ordenación cronológica inteligente: finalizados primero, luego próximos
  const sortedMatches = useMemo(() => {
    const finished = matches
      .filter(m => m.status === 'finished')
      .sort((a, b) => new Date(b.match_date) - new Date(a.match_date));
    
    const upcoming = matches
      .filter(m => m.status !== 'finished')
      .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));

    return [...finished, ...upcoming];
  }, [matches]);

  // ✅ Filtrado por pestaña: 'my' muestra jugando + arbitrando SIN duplicados
  const myMatches = useMemo(() => {
    if (!profile?.id) return [];
    return sortedMatches.filter(m => 
      m.home?.id === profile.id || 
      m.away?.id === profile.id || 
      m.referee_team_id === profile.id
    );
  }, [sortedMatches, profile]);

  const displayedMatches = activeTab === 'my' ? myMatches : sortedMatches;

  const hasFinished = displayedMatches.some(m => m.status === 'finished');
  const hasUpcoming = displayedMatches.some(m => m.status !== 'finished');

  if (loading) return <div className={styles.loading}>Cargando calendario...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>📅 Calendario de Partidos</h1>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'my' ? styles.active : ''}`}
            onClick={() => setActiveTab('my')}
          >
            🏐 Mis Partidos
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'all' ? styles.active : ''}`}
            onClick={() => setActiveTab('all')}
          >
            🌍 Todos los Partidos
          </button>
        </div>
      </header>

      {displayedMatches.length === 0 ? (
        <div className={styles.empty}>
          {activeTab === 'my'
            ? 'No tienes partidos ni arbitrajes asignados.'
            : 'No hay partidos programados aún.'}
        </div>
      ) : (
        <div className={styles.content}>
          {/* Sección: Historial (solo si hay finalizados) */}
          {hasFinished && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>✅ Historial</h2>
              <div className={styles.list}>
                {displayedMatches
                  .filter(m => m.status === 'finished')
                  .map(match => (
                    <MatchCard key={match.id} match={match} userTeamId={profile?.id} />
                  ))}
              </div>
            </section>
          )}

          {/* Sección: Próximos (solo si hay pendientes) */}
          {hasUpcoming && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>⏳ Próximos Encuentros</h2>
              <div className={styles.list}>
                {displayedMatches
                  .filter(m => m.status !== 'finished')
                  .map(match => (
                    <MatchCard key={match.id} match={match} userTeamId={profile?.id} />
                  ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}