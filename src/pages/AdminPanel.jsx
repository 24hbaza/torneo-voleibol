// src/pages/AdminPanel.jsx
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import TeamDetailsModal from "../components/TeamDetailsModal";
import styles from "../styles/AdminPanel.module.css";

export default function AdminPanel() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [resetting, setResetting] = useState(false);

  // ✅ Función centralizada: recibe drawCompleted como parámetro (evita stale closure)
  const fetchMatches = useCallback(async (drawCompleted) => {
    if (!drawCompleted) return;
    
    // ✅ CORRECCIÓN CRÍTICA: Supabase devuelve { data, error }, NO { matchesData, error }
    const { data, error } = await supabase
      .from("matches")
      .select(`
        id, match_date, status, home_score, away_score, 
        live_points_home, live_points_away, current_set, 
        verification_code, court_number,
        home:profiles!matches_home_team_id_fkey (team_name),
        away:profiles!matches_away_team_id_fkey (team_name)
      `)
      .order("match_date", { ascending: true });
    
    if (error) {
      console.error("❌ Error fetchMatches:", error);
      return;
    }
    setMatches(data || []);
  }, []); // ✅ Sin dependencias externas → evita stale closures

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        // ✅ CORRECCIÓN: { data, error } en TODAS las queries
        const { data: teamsData, error: teamsError } = await supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false });
        if (teamsError) throw teamsError;
        if (isMounted) setTeams(teamsData || []);

        const { data: configData, error: configError } = await supabase
          .from("tournament_config")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (configError && configError.code !== 'PGRST116') {
          console.warn("Config no encontrada (normal tras reinicio)");
        }
        if (isMounted) setConfig(configData || null);

        // ✅ Pasar valor directo, no depender de estado
        if (configData?.draw_completed) {
          await fetchMatches(true);
        }
      } catch (err) {
        console.error("❌ Error cargando admin:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();

    // 🔄 SUSCRIPCIÓN REALTIME (con guard y cleanup)
    const channel = supabase
      .channel('admin_matches_live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        () => {
          console.log('📡 Admin: UPDATE detectado');
          // ✅ Guard: solo recargar si hay sorteo activo
          if (config?.draw_completed) {
            fetchMatches(true);
          }
        }
      )
      .subscribe((status) => {
        console.log('🔗 Admin subscription:', status);
      });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [fetchMatches, config?.draw_completed]); // ✅ Dependencias mínimas y estables

  const resetTournament = async () => {
    const confirm1 = window.confirm("⚠️ ¿Eliminar configuración, grupos y partidos? (Equipos se mantienen)");
    if (!confirm1) return;
    const confirm2 = window.confirm("🔴 ÚLTIMA CONFIRMACIÓN: Acción irreversible");
    if (!confirm2) return;
    
    setResetting(true);
    try {
      const { error } = await supabase.rpc('reset_tournament_data');
      if (error) throw error;
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith("seen_draw_")) localStorage.removeItem(key);
      });
      alert("✅ Torneo reiniciado correctamente.");
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("❌ Error al reiniciar: " + err.message);
    } finally {
      setResetting(false);
    }
  };

  if (loading) return <div className={styles.loading}>Cargando panel de administración...</div>;

  return (
    <div className={styles.container}>
      {selectedTeam && <TeamDetailsModal team={selectedTeam} onClose={() => setSelectedTeam(null)} />}

      <header className={styles.header}>
        <h2>🛡️ Panel de Administrador</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={() => navigate("/admin/setup")} className={styles.setupBtn}>⚙️ Configurar</button>
          <button onClick={() => signOut().then(() => navigate("/login"))} className={styles.logoutBtn}>Cerrar Sesión</button>
        </div>
      </header>

      {config && (
        <div className={styles.tournamentSummary}>
          <h3>🏆 {config.name}</h3>
          <p>{config.num_groups} grupos • {config.teams_per_group} equipos/grupo</p>
          {config.draw_completed && <span className={styles.drawBadge}>✅ Sorteo realizado</span>}
        </div>
      )}

      {/* TABLA DE EQUIPOS */}
      <div className={styles.tableWrapper}>
        <h3 style={{ margin: "0 0 1rem 0", padding: "1rem 1rem 0", fontSize: "1.1rem" }}>👥 Equipos Inscritos</h3>
        <table className={styles.table}>
          <thead>
            <tr><th>Equipo</th><th>Jugadores</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {teams.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: "center", padding: "2rem" }}>No hay inscripciones</td></tr>
            ) : (
              teams.map(team => (
                <tr key={team.id} className={styles.row}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {team.badge_url && <img src={team.badge_url} alt="" style={{ width: 30, height: 30, borderRadius: "50%" }} />}
                      <strong>{team.team_name || "Sin nombre"}</strong>
                    </div>
                  </td>
                  <td>{team.player_count || 0}</td>
                  <td><span className={`${styles.badge} ${styles[team.status]}`}>{team.status}</span></td>
                  <td className={styles.actions}>
                    <button onClick={() => setSelectedTeam(team)} className={`${styles.btn} ${styles.view}`}>👁️</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* TABLA DE PARTIDOS */}
      {config?.draw_completed && (
        <div className={styles.tableWrapper} style={{ marginTop: "2rem" }}>
          <h3 style={{ margin: "0 0 1rem 0", padding: "1rem 1rem 0", fontSize: "1.1rem" }}>📅 Partidos y Códigos de Árbitro</h3>
          <div style={{ overflowX: "auto" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Hora / Pista</th><th>Partido</th><th>Marcador (Sets)</th>
                  <th>Puntos (Set Actual)</th><th>Estado</th><th>Código Árbitro</th>
                </tr>
              </thead>
              <tbody>
                {matches.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: "center", padding: "1rem" }}>No hay partidos</td></tr>
                ) : (
                  matches.map(m => (
                    <tr key={m.id} className={styles.row}>
                      <td>{new Date(m.match_date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}<br/><small>Pista {m.court_number}</small></td>
                      <td><strong>{m.home?.team_name}</strong> vs <strong>{m.away?.team_name}</strong></td>
                      <td>{m.home_score || 0} - {m.away_score || 0}</td>
                      <td>{m.live_points_home || 0} - {m.live_points_away || 0}</td>
                      <td><span className={`${styles.badge} ${styles[m.status] || styles.pending}`}>{m.status === 'finished' ? '✅ Finalizado' : m.status === 'live' ? '🔴 En Vivo' : '⏳ Programado'}</span></td>
                      <td><code style={{ background: "#f1f5f9", padding: "0.2rem 0.5rem", borderRadius: "4px", fontWeight: "bold", letterSpacing: "1px" }}>{m.verification_code || "----"}</code></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={styles.resetSection}>
        <h3 className={styles.resetTitle}>🔄 Zona de Pruebas</h3>
        <p className={styles.resetDesc}>Elimina configuración y partidos, pero <strong>mantiene los equipos</strong>.</p>
        <button onClick={resetTournament} disabled={resetting} className={styles.resetBtn}>
          {resetting ? "Reiniciando..." : "Reiniciar Torneo (Mantener Equipos)"}
        </button>
      </div>
    </div>
  );
}