// src/components/AllMatchesView.jsx
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import styles from "../styles/AllMatchesView.module.css";

export default function AllMatchesView() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ Función centralizada con JOINs
  const fetchMatches = useCallback(async () => {
    const { data, error } = await supabase
      .from("matches")
      .select(`
        id, match_date, status, home_score, away_score, 
        live_points_home, live_points_away, current_set, court_number,
        home:profiles!matches_home_team_id_fkey(team_name, badge_url),
        away:profiles!matches_away_team_id_fkey(team_name, badge_url)
      `)
      .order("match_date", { ascending: true });
    
    if (error) {
      console.error("❌ Error fetchMatches:", error);
      return;
    }
    setMatches(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMatches();

    // 🔄 Suscripción Realtime
    const channel = supabase
      .channel('all_matches_live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        () => {
          console.log('📡 AllMatches: UPDATE detectado, recargando...');
          fetchMatches(); // ✅ Recargar con JOINs completos
        }
      )
      .subscribe((status) => {
        console.log('🔗 AllMatches subscription:', status);
      });

    return () => { supabase.removeChannel(channel); };
  }, [fetchMatches]);

  if (loading) return <div className={styles.loading}>Cargando partidos...</div>;

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>📅 Todos los Partidos</h3>
      <div className={styles.grid}>
        {matches.map(m => {
          const isLive = m.status === 'live';
          return (
            <div key={m.id} className={`${styles.card} ${isLive ? styles.liveCard : ''}`}>
              <div className={styles.meta}>
                <span>🕐 {new Date(m.match_date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                <span>🏟️ Pista {m.court_number}</span>
                {isLive && <span className={styles.liveBadge}>🔴 EN VIVO</span>}
              </div>
              <div className={styles.teams}>
                <div className={styles.teamRow}>
                  <img src={m.home?.badge_url} alt="" className={styles.badge} />
                  <span>{m.home?.team_name}</span>
                </div>
                <div className={styles.scoreMain}>
                  {isLive 
                    ? `${m.live_points_home || 0} - ${m.live_points_away || 0}` 
                    : m.status === 'finished' 
                      ? `${m.home_score} - ${m.away_score}` 
                      : 'VS'}
                </div>
                <div className={styles.teamRow}>
                  <span>{m.away?.team_name}</span>
                  <img src={m.away?.badge_url} alt="" className={styles.badge} />
                </div>
              </div>
              {isLive && <div className={styles.setInfo}>Set {m.current_set}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}