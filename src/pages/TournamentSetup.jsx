// src/pages/TournamentSetup.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import DrawAnimation from "../components/DrawAnimation";
import styles from "../styles/TournamentSetup.module.css";

export default function TournamentSetup() {
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawing, setDrawing] = useState(false);
  
  const [showAnimation, setShowAnimation] = useState(false);
  const [animationData, setAnimationData] = useState([]);

  //  Helper: Convierte fecha UTC de Supabase a formato local para el input
  const formatToLocalInput = (utcString) => {
    if (!utcString) return "";
    const date = new Date(utcString);
    // Extraemos año, mes, día, hora y minuto en HORA LOCAL
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  useEffect(() => {
    const fetchConfig = async () => {
      // ✅ SINTAXIS EXPLÍCITA: { data, error }
      const { data, error } = await supabase
        .from("tournament_config")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error("Error cargando config:", error);
      }
      
      // Aplicamos conversión de zona horaria antes de setear el estado
      if (data) {
        data.start_datetime = formatToLocalInput(data.start_datetime);
      }
      setConfig(data || {});
      setLoading(false);
    };
    fetchConfig();
  }, []);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    
    const configToSave = {
      id: config.id,
      ...config,
      // Convertimos hora local del input a ISO/UTC para Supabase
      start_datetime: config.start_datetime ? new Date(config.start_datetime).toISOString() : null
    };
    
    // ✅ SINTAXIS EXPLÍCITA + .select() para recibir el ID generado
    const { data: savedData, error } = await supabase
      .from("tournament_config")
      .upsert(configToSave)
      .select(); 
    
    if (error) {
      alert("❌ Error: " + error.message);
    } else {
      alert("✅ Configuración guardada");
      if (savedData && savedData.length > 0) {
        // Actualizamos con el ID real y mantenemos la hora en formato local para el input
        const fresh = savedData[0];
        fresh.start_datetime = formatToLocalInput(fresh.start_datetime);
        setConfig(fresh);
      }
    }
    setSaving(false);
  };

  const runDraw = async () => {
    if (!config?.id) {
      alert("️ Primero debes guardar la configuración para generar un ID válido.");
      return;
    }
    if (config?.draw_completed) {
      alert("El sorteo ya ha sido realizado.");
      return;
    }
    if (!confirm("¿Ejecutar sorteo y generar calendario?")) return;
    setDrawing(true);

    try {
      console.log("🔍 Paso 1: Cargando equipos aceptados...");
      // ✅ SINTAXIS CORREGIDA EXPLÍCITA
      const { data: teams, error: teamsError } = await supabase
        .from("profiles")
        .select("id, team_name, badge_url")
        .eq("status", "accepted");
      
      console.log("📊 Equipos encontrados:", teams?.length || 0);
      
      if (teamsError) throw new Error(`Error BD: ${teamsError.message}`);
      if (!teams || teams.length === 0) throw new Error("No hay equipos aceptados. Ve al Panel Admin y marca equipos como ✅ Aceptados.");
      
      const { num_groups, teams_per_group } = config;
      if (teams.length < num_groups * teams_per_group) {
        throw new Error(`Se necesitan al menos ${num_groups * teams_per_group} equipos aceptados. (Hay ${teams.length})`);
      }

      console.log("🔍 Paso 2: Creando grupos...");
      const groupNames = ["A", "B", "C", "D", "E", "F", "G", "H"].slice(0, num_groups);
      const { data: groupsData, error: groupsError } = await supabase
        .from("groups")
        .insert(groupNames.map((name, i) => ({
          tournament_id: config.id,
          name: `Grupo ${name}`,
          draw_order: i
        })))
        .select();

      if (groupsError) throw new Error(`Error creando grupos: ${groupsError.message}`);

      console.log("🔍 Paso 3: Asignando equipos a grupos...");
      const shuffled = [...teams].sort(() => Math.random() - 0.5);
      let drawVisuals = [];
      let order = 0;

      for (let i = 0; i < groupsData.length; i++) {
        const group = groupsData[i];
        const groupTeams = shuffled.slice(i * teams_per_group, (i + 1) * teams_per_group);
        
        for (const team of groupTeams) {
          drawVisuals.push({ team, group });
          await supabase.from("group_assignments").insert({
            group_id: group.id,
            team_id: team.id,
            draw_order: order++
          });
        }
      }

      console.log("🔍 Paso 4: Generando calendario inteligente...");
      const matchesToInsert = await generateSmartMatches(groupsData, config, teams);
      
      if (matchesToInsert.length > 0) {
        console.log(` Insertando ${matchesToInsert.length} partidos en lote...`);
        const { error: matchError } = await supabase.from("matches").insert(matchesToInsert);
        if (matchError) throw new Error(`Error creando partidos: ${matchError.message}`);
      }

      console.log("🔍 Paso 5: Marcando sorteo como completado...");
      await supabase
        .from("tournament_config")
        .update({ draw_completed: true })
        .eq("id", config.id);

      setConfig(prev => ({ ...prev, draw_completed: true }));

      console.log("🎉 ¡Sorteo y calendario generados con éxito!");
      setAnimationData(drawVisuals);
      setShowAnimation(true);

    } catch (err) {
      console.error("❌ Error en runDraw:", err);
      alert(`❌ Error: ${err.message}`);
    } finally {
      setDrawing(false);
    }
  };

  const generateSmartMatches = async (groups, cfg, allTeams) => {
    // ✅ Parseo seguro de fecha (ya viene en ISO/UTC desde config)
    let startDate = cfg.start_datetime ? new Date(cfg.start_datetime) : new Date();
    if (isNaN(startDate.getTime())) startDate = new Date(Date.now() + 86400000);

    const matchDuration = cfg.match_duration_minutes || 45;
    const buffer = cfg.buffer_minutes || 10;
    const slotDuration = (matchDuration + buffer) * 60000; 
    const numCourts = cfg.num_courts || 3;
    const isDouble = cfg.match_format === "double";
    const pointsToWin = cfg.points_to_win || 25;
    const setsToWin = cfg.sets_to_win || 2;

    const teamLastPlay = {};
    allTeams.forEach(t => teamLastPlay[t.id] = -1);
    const teamRefereeCount = {};
    allTeams.forEach(t => teamRefereeCount[t.id] = 0);

    let allMatches = [];
    
    for (const group of groups) {
      const { data: assignments } = await supabase.from("group_assignments").select("team_id").eq("group_id", group.id);
      const teamIds = assignments.map(a => a.team_id);
      
      for (let i = 0; i < teamIds.length; i++) {
        for (let j = i + 1; j < teamIds.length; j++) {
          allMatches.push({ group_id: group.id, home: teamIds[i], away: teamIds[j] });
          if (isDouble) allMatches.push({ group_id: group.id, home: teamIds[j], away: teamIds[i] });
        }
      }
    }

    allMatches.sort((a, b) => {
      const aRest = (teamLastPlay[a.home] || -999) + (teamLastPlay[a.away] || -999);
      const bRest = (teamLastPlay[b.home] || -999) + (teamLastPlay[b.away] || -999);
      return aRest - bRest;
    });

    const schedule = {};
    let currentTimeSlot = 0;

    for (const match of allMatches) {
      let assigned = false;
      let attempts = 0;
      
      while (!assigned && attempts < 50) {
        const slotKey = currentTimeSlot + attempts;
        const slotMatches = schedule[slotKey] || [];
        const teamsInSlot = new Set();
        slotMatches.forEach(m => { teamsInSlot.add(m.home); teamsInSlot.add(m.away); });
        
        if (!teamsInSlot.has(match.home) && !teamsInSlot.has(match.away) && slotMatches.length < numCourts) {
          const usedCourts = slotMatches.map(m => m.court);
          const availableCourt = Array.from({length: numCourts}, (_, i) => i + 1).find(c => !usedCourts.includes(c));
          
          if (availableCourt) {
            const matchDate = new Date(startDate.getTime() + slotKey * slotDuration);
            const referee = findBestReferee(match, allTeams, slotMatches, teamRefereeCount, teamLastPlay);
            
            schedule[slotKey] = schedule[slotKey] || [];
            schedule[slotKey].push({
              group_id: match.group_id,
              home_team_id: match.home,
              away_team_id: match.away,
              match_date: matchDate.toISOString(),
              court_number: availableCourt,
              referee_team_id: referee,
              verification_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
              round: "group_stage",
              status: "scheduled",
              points_to_win: pointsToWin,
              sets_to_win: setsToWin
            });
            
            teamLastPlay[match.home] = slotKey;
            teamLastPlay[match.away] = slotKey;
            if (referee) teamRefereeCount[referee]++;
            assigned = true;
          }
        }
        attempts++;
      }
      if (!assigned) currentTimeSlot++;
    }

    return Object.values(schedule).flat();
  };

  const findBestReferee = (match, allTeams, slotMatches, refCounts, lastPlay) => {
    const playingTeams = new Set([match.home, match.away]);
    slotMatches.forEach(m => { playingTeams.add(m.home); playingTeams.add(m.away); });
    const eligible = allTeams.filter(t => !playingTeams.has(t.id));
    if (eligible.length === 0) return null;

    eligible.sort((a, b) => {
      const aRefs = refCounts[a.id] || 0;
      const bRefs = refCounts[b.id] || 0;
      if (aRefs !== bRefs) return aRefs - bRefs;
      return (lastPlay[a.id] || -999) - (lastPlay[b.id] || -999);
    });
    return eligible[0].id;
  };

  if (loading) return <div className={styles.loading}>Cargando configuración...</div>;

  return (
    <div className={styles.container}>
      {showAnimation && (
        <DrawAnimation drawResults={animationData} onClose={() => { setShowAnimation(false); navigate("/admin"); }} />
      )}

      <h2>️ Configuración del Torneo</h2>
      
      <div className={styles.form}>
        <div className={styles.field}>
          <label>Nombre del Torneo</label>
          <input value={config.name || ""} onChange={(e) => setConfig({...config, name: e.target.value})} className={styles.input} />
        </div>
        
        <div className={styles.row}>
          <div className={styles.field}>
            <label>Número de Grupos</label>
            <select value={config.num_groups || 2} onChange={(e) => setConfig({...config, num_groups: parseInt(e.target.value)})} className={styles.input}>
              {[2,4,6,8].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label>Equipos por Grupo</label>
            <select value={config.teams_per_group || 4} onChange={(e) => setConfig({...config, teams_per_group: parseInt(e.target.value)})} className={styles.input}>
              {[3,4,5,6].map(n => <option key={n} value={n}>{n} equipos</option>)}
            </select>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label>📅 Fecha y Hora de Inicio</label>
            <input type="datetime-local" value={config.start_datetime || ""} onChange={(e) => setConfig({...config, start_datetime: e.target.value})} className={styles.input} />
          </div>
          <div className={styles.field}>
            <label>🏟️ Número de Pistas</label>
            <select value={config.num_courts || 3} onChange={(e) => setConfig({...config, num_courts: parseInt(e.target.value)})} className={styles.input}>
              {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} pista(s)</option>)}
            </select>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label>⏱️ Duración Partido (min)</label>
            <input type="number" value={config.match_duration_minutes || 45} onChange={(e) => setConfig({...config, match_duration_minutes: parseInt(e.target.value)})} className={styles.input} min="15" max="120" />
          </div>
          <div className={styles.field}>
            <label>⏸️ Tiempo entre Partidos (min)</label>
            <input type="number" value={config.buffer_minutes || 10} onChange={(e) => setConfig({...config, buffer_minutes: parseInt(e.target.value)})} className={styles.input} min="5" max="30" />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label>🎯 Puntos para ganar set</label>
            <select value={config.points_to_win || 25} onChange={(e) => setConfig({...config, points_to_win: parseInt(e.target.value)})} className={styles.input}>
              {[15, 21, 25].map(n => <option key={n} value={n}>{n} puntos</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label> Sets para ganar partido</label>
            <select value={config.sets_to_win || 2} onChange={(e) => setConfig({...config, sets_to_win: parseInt(e.target.value)})} className={styles.input}>
              <option value={1}>1 set</option>
              <option value={2}>2 sets (mejor de 3)</option>
              <option value={3}>3 sets (mejor de 5)</option>
            </select>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label>Formato de Partidos</label>
            <select value={config.match_format || "double"} onChange={(e) => setConfig({...config, match_format: e.target.value})} className={styles.input}>
              <option value="single">🔹 Solo Ida</option>
              <option value="double">🔄 Ida y Vuelta</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>Equipos que clasifican</label>
            <select value={config.teams_advancing || 2} onChange={(e) => setConfig({...config, teams_advancing: parseInt(e.target.value)})} className={styles.input}>
              {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        
        <div className={styles.field}>
          <label>Fecha Límite de Inscripción</label>
          <input type="datetime-local" value={config.registration_deadline?.slice(0,16) || ""} onChange={(e) => setConfig({...config, registration_deadline: e.target.value})} className={styles.input} />
        </div>
        
        <button onClick={saveConfig} disabled={saving} className={styles.saveBtn}>
          {saving ? "Guardando..." : "💾 Guardar Configuración"}
        </button>
      </div>
      
      <hr className={styles.divider} />
      
      <div className={styles.drawSection}>
        <h3>🎲 Ejecutar Sorteo</h3>
        <p className={styles.hint}>Genera grupos, horarios equilibrados, pistas y árbitros automáticamente.</p>
        
        {config?.draw_completed ? (
          <div className={styles.success}>
            ✅ Sorteo ya realizado. <button onClick={() => navigate("/admin")} className={styles.linkBtn}>Volver al panel</button>
          </div>
        ) : (
          <button onClick={runDraw} disabled={drawing} className={styles.drawBtn}>
            {drawing ? "🎬 Generando..." : "🚀 Iniciar Sorteo y Calendario"}
          </button>
        )}
      </div>
    </div>
  );
}