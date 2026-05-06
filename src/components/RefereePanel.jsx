// src/components/RefereePanel.jsx
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import styles from "../styles/RefereePanel.module.css";

export default function RefereePanel({ onMatchUpdated }) {
  const { user } = useAuth();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMyRefMatches = async () => {
      // Buscar partidos donde el usuario es el árbitro Y aún no han terminado
      const { data, error } = await supabase
        .from("matches")
        .select(`
          id,
          verification_code,
          status,
          match_date,
          court_number,
          home:profiles!matches_home_team_id_fkey (team_name),
          away:profiles!matches_away_team_id_fkey (team_name)
        `)
        .eq("referee_team_id", user.id)
        .neq("status", "finished") 
        .order("match_date", { ascending: true });

      if (data) setMatches(data);
      setLoading(false);
    };
    if (user) fetchMyRefMatches();
  }, [user]);

  const submitScore = async (matchId, code, homeScore, awayScore) => {
    const match = matches.find(m => m.id === matchId);
    
    // Verificar código
    if (!match || match.verification_code !== code.toUpperCase()) {
      alert("❌ Código de verificación incorrecto.");
      return;
    }

    // Actualizar en BD
    const { error } = await supabase
      .from("matches")
      .update({
        home_score: homeScore,
        away_score: awayScore,
        status: "finished"
      })
      .eq("id", matchId);

    if (error) {
      alert("Error al guardar: " + error.message);
    } else {
      alert("✅ Resultado registrado correctamente.");
      // Remover de la lista local y notificar al padre
      setMatches(prev => prev.filter(m => m.id !== matchId));
      onMatchUpdated?.(); 
    }
  };

  if (loading) return null;
  if (matches.length === 0) return null; // Si no eres árbitro de nada, no renderiza

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>🟥 Zona de Arbitraje</h3>
      <p className={styles.subtitle}>Tienes partidos pendientes de arbitrar.</p>
      
      <div className={styles.list}>
        {matches.map(match => {
           const timeStr = new Date(match.match_date).toLocaleTimeString('es-ES', { 
            hour: '2-digit', minute:'2-digit' 
          });

          return (
            <div key={match.id} className={styles.card}>
              <div className={styles.matchHeader}>
                <span className={styles.time}>🕐 {timeStr}</span>
                <span className={styles.court}>🏟️ Pista {match.court_number || 1}</span>
              </div>

              <div className={styles.teams}>
                <span>{match.home.team_name}</span>
                <span className={styles.vs}>VS</span>
                <span>{match.away.team_name}</span>
              </div>
              
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.target);
                  submitScore(
                    match.id, 
                    formData.get("code"), 
                    parseInt(formData.get("home")), 
                    parseInt(formData.get("away"))
                  );
                }}
                className={styles.form}
              >
                <input name="code" placeholder="Código del Partido (Ej: A1B2C3)" className={styles.inputCode} required />
                <div className={styles.scores}>
                  <input name="home" type="number" placeholder="Sets Local" min="0" className={styles.inputScore} required />
                  <input name="away" type="number" placeholder="Sets Visitante" min="0" className={styles.inputScore} required />
                </div>
                <button type="submit" className={styles.btn}>Finalizar Partido</button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}