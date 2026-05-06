// src/components/TeamMatchList.jsx
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import styles from "../styles/TeamMatchList.module.css";

export default function TeamMatchList({ userTeamId }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ Función centralizada para cargar partidos CON JOINS
  const loadMatches = useCallback(async () => {
    if (!userTeamId) return;
    
    const {  data, error } = await supabase
      .from("matches")
      .select(`
        id, match_date, status, home_score, away_score, 
        live_points_home, live_points_away, current_set, court_number,
        points_to_win, sets_to_win,
        home:profiles!matches_home_team_id_fkey (id, team_name, badge_url),
        away:profiles!matches_away_team_id_fkey (id, team_name, badge_url),
        referee:profiles!matches_referee_team_id_fkey (team_name)
      `)
      .or(`home_team_id.eq.${userTeamId},away_team_id.eq.${userTeamId}`)
      .order("match_date", { ascending: true });

    if (error) {
      console.error("❌ Error loadMatches:", error);
      return;
    }
    setMatches(data || []);
    setLoading(false);
  }, [userTeamId]);

  useEffect(() => {
    loadMatches();

    // 🔄 SUSCRIPCIÓN REALTIME
    const channel = supabase
      .channel('public:matches')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        () => {
          console.log('📡 TeamMatchList: cambio detectado, recargando...');
          loadMatches(); // ✅ Recargar con JOINs completos, NO usar payload.new
        }
      )
      .subscribe((status) => {
        console.log('🔗 TeamMatchList subscription:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadMatches]);

  if (loading) return <div className={styles.loading}>Cargando calendario...</div>;

  if (matches.length === 0) return <div className={styles.empty}>No hay partidos programados.</div>;

  return (
    <div className={styles.matchesContainer}>
      <h3 className={styles.sectionTitle}>️ Mis Partidos</h3>
      <div className={styles.list}>
        {matches.map((match) => {
          const isHome = match.home?.id === userTeamId;
          const myScore = isHome ? match.home_score : match.away_score;
          const oppScore = isHome ? match.away_score : match.home_score;
          const isLive = match.status === 'live';

          const dateStr = new Date(match.match_date).toLocaleDateString('es-ES', { 
            weekday: 'short', day: 'numeric', month: 'short' 
          });
          const timeStr = new Date(match.match_date).toLocaleTimeString('es-ES', { 
            hour: '2-digit', minute:'2-digit' 
          });

          return (
            <div key={match.id} className={`${styles.matchCard} ${match.status === 'finished' ? styles.finished : ''}`}>
              
              {/* Cabecera: Fecha, Hora, Pista */}
              <div className={styles.matchHeader}>
                <span className={styles.matchDate}>📅 {dateStr}</span>
                <span className={styles.matchTime}>🕐 {timeStr}</span>
                <span className={styles.courtBadge}>🏟️ Pista {match.court_number || 1}</span>
              </div>
              
              {/* Cuerpo: Equipos y Marcador */}
              <div className={styles.matchContent}>
                <div className={styles.team}>
                  <img src={match.home?.badge_url || "/default.png"} alt="" className={styles.miniBadge} />
                  <span className={isHome ? styles.highlight : ""}>{match.home?.team_name}</span>
                </div>
                
                <div className={styles.scoreBoard}>
                  {match.status === 'finished' ? (
                    <span className={styles.result}>{myScore} - {oppScore}</span>
                  ) : isLive ? (
                    <span className={styles.liveScore}>{match.live_points_home || 0} - {match.live_points_away || 0}</span>
                  ) : (
                    <span className={styles.vs}>VS</span>
                  )}
                </div>

                <div className={styles.team}>
                  <img src={match.away?.badge_url || "/default.png"} alt="" className={styles.miniBadge} />
                  <span className={!isHome ? styles.highlight : ""}>{match.away?.team_name}</span>
                </div>
              </div>

              {/* Pie: Estado, Árbitro, Formato */}
              <div className={styles.matchMeta}>
                <span className={styles.statusBadge}>
                  {match.status === 'finished' ? "Finalizado ✅" : isLive ? "🔴 EN VIVO" : "Programado"}
                </span>
                
                {match.referee && (
                  <span className={styles.referee}>🟥 Árbitro: {match.referee.team_name}</span>
                )}

                {match.sets_to_win && (
                  <span className={styles.format}>🎯 Al mejor de {match.sets_to_win * 2 - 1} sets ({match.points_to_win} pts)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}