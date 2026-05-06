// src/components/RefereeLiveScoreboard.jsx
import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import styles from "../styles/RefereeLiveScoreboard.module.css";

export default function RefereeLiveScoreboard() {
  const navigate = useNavigate();
  const { matchId } = useParams();
  
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState("connecting");

  // ✅ Función centralizada para cargar datos CON JOINS
  const fetchMatch = useCallback(async () => {
    if (!matchId) return null;
    
    const { data, error: fetchError } = await supabase
      .from("matches")
      .select(`
        id, match_date, status, home_score, away_score,
        live_points_home, live_points_away, current_set, sets_details,
        home:profiles!matches_home_team_id_fkey(id, team_name, badge_url),
        away:profiles!matches_away_team_id_fkey(id, team_name, badge_url)
      `)
      .eq("id", matchId)
      .single();

    if (fetchError) {
      console.error("❌ Error fetchMatch:", fetchError);
      return null;
    }
    return data;
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;

    let isMounted = true;

    const init = async () => {
      // 1. Carga inicial
      const initialData = await fetchMatch();
      if (isMounted) {
        if (initialData) {
          setMatch(initialData);
          setError("");
        } else {
          setError("No se pudo cargar el partido");
        }
        setLoading(false);
      }

      // 2. Suscribirse a Realtime
      const channel = supabase
        .channel(`match_${matchId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
          async (payload) => {
            console.log("📡 Realtime UPDATE recibido:", payload);
            // ✅ CLAVE: No usar payload.new (sin joins), recargar con fetchMatch()
            const refreshed = await fetchMatch();
            if (isMounted && refreshed) {
              setMatch(refreshed);
            }
          }
        )
        .subscribe((status) => {
          console.log("🔗 Subscription status:", status);
          setSubscriptionStatus(status);
          if (status === "SUBSCRIBED") {
            console.log("✅ Realtime conectado correctamente");
          } else if (status === "CHANNEL_ERROR") {
            console.error("❌ Error de conexión Realtime");
          }
        });

      return () => {
        isMounted = false;
        supabase.removeChannel(channel);
      };
    };

    init();
  }, [matchId, fetchMatch]);

  // ✅ Actualización con: 1) Optimistic UI + 2) Sync automático + 3) Status 'live'
  const updatePoints = async (team, change) => {
    if (!match) return;
    
    const field = team === "home" ? "live_points_home" : "live_points_away";
    const current = match[field] || 0;
    const newValue = Math.max(0, current + change);

    // 1. Optimistic update (respuesta inmediata)
    setMatch(prev => prev ? { ...prev, [field]: newValue } : prev);

    // 2. Preparar actualización: asegurar status='live' si es el primer punto
    const updatePayload = { [field]: newValue };
    if (match.status !== "live" && (match.live_points_home || 0) + (match.live_points_away || 0) === 0) {
      updatePayload.status = "live";
    }

    // 3. Enviar a BD
    const { error } = await supabase
      .from("matches")
      .update(updatePayload)
      .eq("id", matchId);

    if (error) {
      console.error("❌ Error DB:", error);
      // Rollback si falla
      setMatch(prev => prev ? { ...prev, [field]: current } : prev);
      alert("❌ Error de conexión. Intenta de nuevo.");
    }
    // ✅ Si funciona, el Realtime sincronizará el resto de clientes automáticamente
  };

  const endSet = async () => {
    if (!match) return;
    const homePts = match.live_points_home || 0;
    const awayPts = match.live_points_away || 0;

    let newHomeSets = match.home_score || 0;
    let newAwaySets = match.away_score || 0;
    const setNum = match.current_set || 1;

    if (homePts > awayPts) newHomeSets++;
    else if (awayPts > homePts) newAwaySets++;

    const newSetsDetails = [...(match.sets_details || []), { set: setNum, home: homePts, away: awayPts }];
    const setsToWin = 2;
    const isMatchOver = newHomeSets >= setsToWin || newAwaySets >= setsToWin;

    const { error } = await supabase.from("matches").update({
      home_score: newHomeSets,
      away_score: newAwaySets,
      sets_details: newSetsDetails,
      live_points_home: 0,
      live_points_away: 0,
      current_set: isMatchOver ? setNum : setNum + 1,
      status: isMatchOver ? "finished" : "live"
    }).eq("id", matchId);

    if (error) alert("Error al finalizar set: " + error.message);
  };

  const finishMatch = async () => {
    const { error } = await supabase.from("matches").update({ status: "finished" }).eq("id", matchId);
    if (error) {
      alert("Error: " + error.message);
    } else {
      alert("✅ Partido finalizado");
      navigate("/arbitro");
    }
  };

  if (loading) return <div className={styles.loading}>⏳ Cargando marcador... <small>({subscriptionStatus})</small></div>;
  if (error) return <div className={styles.error}>{error}</div>;
  if (!match) return <div className={styles.error}>Partido no encontrado</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.team}>
          <h2>{match.home?.team_name || "Local"}</h2>
          <div className={styles.score}>{match.live_points_home || 0}</div>
          <div className={styles.controls}>
            <button onClick={() => updatePoints("home", 1)}>+1</button>
            <button onClick={() => updatePoints("home", -1)}>-1</button>
          </div>
        </div>

        <div className={styles.centerInfo}>
          <div className={styles.sets}>{match.home_score || 0} - {match.away_score || 0}</div>
          <div className={styles.setLabel}>SET {match.current_set || 1}</div>
          {match.status === "live" && <span className={styles.liveIndicator}>🔴 EN VIVO</span>}
          {subscriptionStatus !== "SUBSCRIBED" && (
            <small style={{ color: "#f59e0b", display: "block", marginTop: "0.25rem" }}>
              ⚠️ Conectando realtime...
            </small>
          )}
        </div>

        <div className={styles.team}>
          <h2>{match.away?.team_name || "Visitante"}</h2>
          <div className={styles.score}>{match.live_points_away || 0}</div>
          <div className={styles.controls}>
            <button onClick={() => updatePoints("away", 1)}>+1</button>
            <button onClick={() => updatePoints("away", -1)}>-1</button>
          </div>
        </div>
      </header>

      {match.sets_details?.length > 0 && (
        <div className={styles.setsHistory}>
          <strong>Historial:</strong>
          <div className={styles.setsList}>
            {match.sets_details.map((s, i) => (
              <span key={i} className={styles.setChip}>Set {s.set}: {s.home}-{s.away}</span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <button onClick={endSet} className={styles.btnSet}>⏹️ Finalizar Set</button>
        <button onClick={finishMatch} className={styles.btnFinish}>🏁 Finalizar Partido</button>
        <button onClick={() => navigate("/arbitro")} className={styles.btnBack}>⬅️ Volver</button>
      </div>
    </div>
  );
}