// src/pages/admin/TournamentDraw.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Button, Card } from '../../design-system/components';
import { sendToTeam } from '../../lib/notifications';
import styles from './TournamentDraw.module.css';

// 🛡️ Utilidades
const safeTime = (dateInput) => {
  try { return new Date(dateInput).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
  catch { return '00:00'; }
};

const shuffleArray = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// 🧠 GENERADOR DE JORNADAS ROUND-ROBIN
const generateRoundRobinMatches = (teams, isDouble = false) => {
  let n = teams.length;
  if (n % 2 !== 0) {
    teams = [...teams, { id: 'bye', team_name: 'Descansa', isBye: true }];
    n = teams.length;
  }
  const rounds = [];
  const numRounds = n - 1;
  const halfSize = n / 2;
  
  for (let round = 0; round < numRounds; round++) {
    const roundMatches = [];
    for (let i = 0; i < halfSize; i++) {
      const home = teams[i];
      const away = teams[n - 1 - i];
      if (!home.isBye && !away.isBye) {
        roundMatches.push({ home: home.id, away: away.id });
      }
    }
    rounds.push(roundMatches);
    teams = [teams[0], ...teams.slice(2), teams[1]];
  }
  if (isDouble) {
    const returnRounds = rounds.map(round => 
      round.map(match => ({ home: match.away, away: match.home }))
    );
    rounds.push(...returnRounds);
  }
  return rounds;
};

// 🧠 SCHEDULER REFACTORIZADO (MAXIMIZACIÓN DE PISTAS + SIN BLOQUEOS ARTIFICIALES)
const scheduleMatches = (groupsWithTeams, config, onLog) => {
  const { num_courts, match_duration_minutes = 45, buffer_minutes = 0, start_datetime, match_format } = config;
  const duration = (match_duration_minutes + buffer_minutes) * 60000;
  
  let currentTime = new Date(start_datetime).getTime();
  let scheduled = [];
  let teamRefereeCount = {};
  let teamBusyUntil = {}; // SOLO para equipos que están JUGANDO
  let remainingMatchesByTeam = {};
  
  // Inicializar contadores
  groupsWithTeams.forEach(g => {
    g.teams.forEach(t => {
      if (!t.isBye) {
        teamRefereeCount[t.id] = 0;
        teamBusyUntil[t.id] = 0;
        remainingMatchesByTeam[t.id] = 0;
      }
    });
  });
  
  // Generar cola de partidos pendientes
  let pendingMatches = [];
  groupsWithTeams.forEach(group => {
    const rounds = generateRoundRobinMatches(group.teams, match_format === 'double');
    rounds.forEach((roundMatches, roundIndex) => {
      roundMatches.forEach(match => {
        pendingMatches.push({
          group_id: group.id,
          home_team_id: match.home,
          away_team_id: match.away,
          round: roundIndex + 1
        });
        remainingMatchesByTeam[match.home] = (remainingMatchesByTeam[match.home] || 0) + 1;
        remainingMatchesByTeam[match.away] = (remainingMatchesByTeam[match.away] || 0) + 1;
      });
    });
  });
  
  // 🔥 BUCLE PRINCIPAL OPTIMIZADO
  while (pendingMatches.length > 0) {
    // 9️⃣ Randomizar para evitar patrones repetitivos
    pendingMatches = shuffleArray(pendingMatches);

    let slotMatches = [];
    let slotPlayingTeams = new Set(); // 1️⃣ Separado de árbitros
    let slotReferees = new Set();     // 1️⃣ Separado de jugadores
    let assignedInSlot = new Set();

    // 7️⃣ Filtrar TODOS los partidos válidos (no greedy)
    let validMatches = pendingMatches.filter(m => {
      const homeFree = (teamBusyUntil[m.home_team_id] || 0) <= currentTime;
      const awayFree = (teamBusyUntil[m.away_team_id] || 0) <= currentTime;
      // 2️⃣ Validación solo contra equipos jugando
      return homeFree && awayFree && 
             !slotPlayingTeams.has(m.home_team_id) && 
             !slotPlayingTeams.has(m.away_team_id);
    });

    // 🔟 Heurística: priorizar equipos con mayor tiempo inactivo
    validMatches.sort((a, b) => {
      const aIdle = Math.max(teamBusyUntil[a.home_team_id] || 0, teamBusyUntil[a.away_team_id] || 0);
      const bIdle = Math.max(teamBusyUntil[b.home_team_id] || 0, teamBusyUntil[b.away_team_id] || 0);
      return bIdle - aIdle; // Mayor inactividad primero
    });

    // 8️⃣ Llenar TODAS las pistas posibles con combinaciones compatibles
    for (let court = 1; court <= num_courts; court++) {
      const match = validMatches.find(m => 
        !assignedInSlot.has(m) &&
        !slotPlayingTeams.has(m.home_team_id) && 
        !slotPlayingTeams.has(m.away_team_id)
      );

      if (match) {
        slotMatches.push({ ...match, court });
        // 3️⃣ Reservar solo en slotPlayingTeams
        slotPlayingTeams.add(match.home_team_id);
        slotPlayingTeams.add(match.away_team_id);
        assignedInSlot.add(match);
      } else {
        break; // No hay más combinaciones válidas para las pistas restantes
      }
    }

    if (slotMatches.length === 0) {
      const nextFree = Object.values(teamBusyUntil).filter(t => t > currentTime);
      currentTime = nextFree.length > 0 ? Math.min(...nextFree) : currentTime + duration;
      continue;
    }

    // Limpiar pendientes asignados
    pendingMatches = pendingMatches.filter(m => !assignedInSlot.has(m));

    // 4️⃣ & 5️⃣ Asignar árbitros con validación dual y reserva correcta
    const endTime = currentTime + duration;
    const allTeams = groupsWithTeams.flatMap(g => g.teams.filter(t => !t.isBye));

    slotMatches.forEach(match => {
      const { court, ...matchData } = match;
      const cleanMatch = {
        ...matchData,
        court_number: court,
        match_date: new Date(currentTime).toISOString(),
        verification_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
        status: 'scheduled',
        home_score: 0,
        away_score: 0,
        points_to_win: config.points_to_win || 25,
        sets_to_win: config.sets_to_win || 2
      };

      const groupTeams = groupsWithTeams.find(g => g.id === match.group_id)?.teams || [];
      
      // 4️⃣ Validación: no juega Y no arbitra en este slot
      const possibleRefs = groupTeams.filter(t => 
        !t.isBye && 
        t.id !== match.home_team_id && 
        t.id !== match.away_team_id &&
        (teamBusyUntil[t.id] || 0) <= currentTime && 
        !slotPlayingTeams.has(t.id) && 
        !slotReferees.has(t.id)
      ).sort((a, b) => teamRefereeCount[a.id] - teamRefereeCount[b.id]); // 1️⃣1️⃣ Equidad
      
      let selectedRef = null;
      if (possibleRefs.length > 0) {
        selectedRef = possibleRefs[0];
      } else {
        const allPossibleRefs = allTeams.filter(t => 
          t.id !== match.home_team_id && 
          t.id !== match.away_team_id &&
          (teamBusyUntil[t.id] || 0) <= currentTime && 
          !slotPlayingTeams.has(t.id) && 
          !slotReferees.has(t.id)
        ).sort((a, b) => teamRefereeCount[a.id] - teamRefereeCount[b.id]);
        
        if (allPossibleRefs.length > 0) selectedRef = allPossibleRefs[0];
      }

      if (selectedRef) {
        cleanMatch.referee_team_id = selectedRef.id;
        // 6️⃣ NO bloquear teamBusyUntil al arbitrar
        slotReferees.add(selectedRef.id); // 5️⃣ Reserva correcta
        teamRefereeCount[selectedRef.id]++;
      }

      // Actualizar disponibilidad SOLO por jugar
      teamBusyUntil[match.home_team_id] = endTime;
      teamBusyUntil[match.away_team_id] = endTime;
      remainingMatchesByTeam[match.home_team_id]--;
      remainingMatchesByTeam[match.away_team_id]--;
      
      scheduled.push(cleanMatch);
      
      if (scheduled.length <= 4) {
        const refName = selectedRef ? selectedRef.team_name : 'Sin asignar';
        onLog(`🏟️ P${court} | ${match.home_team_id.slice(0,4)} vs ${match.away_team_id.slice(0,4)} | 🟥 ${refName}`);
      }
    });

    currentTime += duration;
  }

  const refStats = Object.entries(teamRefereeCount).sort((a, b) => a[1] - b[1]).map(([id, c]) => `${id.slice(0,4)}:${c}`);
  console.log('📊 Arbitrajes:', refStats.join(', '));
  
  return scheduled;
};

// 🖥️ Componente Principal
export default function TournamentDraw() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('idle');
  const [config, setConfig] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null, message: '' });

  useEffect(() => { fetchConfig(); }, []);

  const fetchConfig = async () => {
    // ✅ REGLA SUPABASE: { data, error }
    const { data, error } = await supabase
      .from('tournament_config')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') console.error('Fetch config error:', error);
    if (data) setConfig(data);
  };

  const addLog = useCallback((msg) => {
    setLogs(prev => [`[${safeTime(new Date())}] ${msg}`, ...prev].slice(0, 100));
  }, []);

  const handleConfirm = useCallback(async () => {
    setConfirmDialog(prev => ({ ...prev, open: false }));
    if (confirmDialog.action === 'draw') await executeDraw();
    if (confirmDialog.action === 'reset') await resetDraw();
  }, [confirmDialog]);

  const executeDraw = async () => {
    setLoading(true);
    setStatus('running');
    setLogs([]);
    addLog("🚀 Iniciando proceso de sorteo...");

    try {
      if (!config?.start_datetime || !config?.num_groups || !config?.num_courts) {
        throw new Error("Falta configuración obligatoria.");
      }

      addLog("📋 Obteniendo equipos aceptados...");
      
      // ✅ CORRECCIÓN CRÍTICA: { data: teams, error: errTeams }
      const { data: teams, error: errTeams } = await supabase
        .from('profiles')
        .select('id, team_name')
        .eq('status', 'accepted')
        .order('team_name');
      
      if (errTeams) throw new Error('Error BD: ' + errTeams.message);
      if (!teams || teams.length < 2) throw new Error("Se necesitan al menos 2 equipos aceptados.");
      addLog(`✅ ${teams.length} equipos listos.`);

      const safeId = '00000000-0000-0000-0000-000000000000';
      addLog("🧹 Limpiando datos anteriores...");
      const { error: e1 } = await supabase.from('matches').delete().neq('id', safeId); if (e1) throw e1;
      const { error: e2 } = await supabase.from('group_assignments').delete().neq('id', safeId); if (e2) throw e2;
      const { error: e3 } = await supabase.from('groups').delete().neq('id', safeId); if (e3) throw e3;

      addLog("📂 Creando grupos oficiales...");
      const groupsPayload = Array.from({ length: config.num_groups }, (_, i) => ({ 
        name: `Grupo ${String.fromCharCode(65 + i)}`, draw_order: i + 1 
      }));
      
      // ✅ CORRECCIÓN CRÍTICA: { data: createdGroups, error: errGrp }
      const { data: createdGroups, error: errGrp } = await supabase
        .from('groups')
        .insert(groupsPayload)
        .select('id, name, draw_order');
      
      if (errGrp) throw new Error('Error creando grupos: ' + errGrp.message);
      if (!createdGroups) throw new Error("No se recibieron IDs de grupos creados.");
      addLog(`✅ ${createdGroups.length} grupos creados.`);

      addLog("🎲 Asignando equipos (Fisher-Yates)...");
      const shuffledTeams = shuffleArray(teams);
      const assignments = [];
      const groupsWithTeams = createdGroups.map(g => ({ ...g, teams: [] }));

      shuffledTeams.forEach((team, index) => {
        const groupIdx = index % config.num_groups;
        assignments.push({ group_id: groupsWithTeams[groupIdx].id, team_id: team.id, draw_order: index + 1 });
        groupsWithTeams[groupIdx].teams.push(team);
      });

      const { error: errAssign } = await supabase.from('group_assignments').insert(assignments);
      if (errAssign) throw new Error('Error asignando equipos: ' + errAssign.message);
      addLog("✅ Distribución completada.");

      addLog("⚔️ Generando horarios por slots optimizados...");
      const finalScheduled = scheduleMatches(groupsWithTeams, config, addLog);
      
      addLog("💾 Guardando calendario...");
      const { error: errInsert } = await supabase.from('matches').insert(finalScheduled);
      if (errInsert) throw new Error('Error guardando: ' + errInsert.message);

      const { error: errUpdate } = await supabase.from('tournament_config').update({ draw_completed: true }).neq('id', safeId);
      if (errUpdate) throw new Error('Error actualizando config: ' + errUpdate.message);

      // 🔔 Notificaciones
      // ✅ CORRECCIÓN CRÍTICA: { data: teamIds, error: teamErr }
      const { data: teamIds, error: teamErr } = await supabase
        .from('group_assignments')
        .select('team_id');
      
      if (!teamErr && teamIds) {
        const uniqueIds = [...new Set(teamIds.map(t => t.team_id))];
        await Promise.all(uniqueIds.map(id => 
          sendToTeam(id, 'match_scheduled', '📅 Calendario Publicado', 'Ya puedes ver tus partidos y horarios en "Mis Partidos".', '/dashboard/partidos')
        ));
      }

      setStatus('success');
      addLog("🎉 ¡SORTEO COMPLETADO!");

    } catch (err) {
      console.error('Draw Error:', err);
      setStatus('error');
      addLog(`❌ ERROR: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetDraw = async () => {
    setLoading(true);
    addLog("🔄 Reiniciando sorteo...");
    const safeId = '00000000-0000-0000-0000-000000000000';
    try {
      const { error: e1 } = await supabase.from('matches').delete().neq('id', safeId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('group_assignments').delete().neq('id', safeId);
      if (e2) throw e2;
      const { error: e3 } = await supabase.from('groups').delete().neq('id', safeId);
      if (e3) throw e3;
      const { error: e4 } = await supabase.from('tournament_config').update({ draw_completed: false }).neq('id', safeId);
      if (e4) throw e4;
      setStatus('idle'); setLogs([]); addLog("✅ Sorteo reiniciado.");
    } catch (err) { addLog(`❌ Error en reset: ${err.message}`); }
    finally { setLoading(false); }
  };

  return (
    <div className={styles.container}>
      {confirmDialog.open && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>⚠️ Confirmar Acción</h3>
            <p>{confirmDialog.message}</p>
            <div className={styles.modalActions}>
              <Button variant="ghost" onClick={() => setConfirmDialog(p => ({ ...p, open: false }))}>Cancelar</Button>
              <Button variant="danger" onClick={handleConfirm} loading={loading}>Confirmar</Button>
            </div>
          </div>
        </div>
      )}
      <header className={styles.header}>
        <h1 className={styles.title}>🎲 Sorteo y Calendario</h1>
        {config?.draw_completed && (
          <Button variant="danger" onClick={() => setConfirmDialog({ open: true, action: 'reset', message: '¿Borrar sorteo y grupos?' })} disabled={loading}>🗑️ Reiniciar</Button>
        )}
      </header>
      <div className={styles.infoGrid}>
        <Card><h3>📊 Configuración Activa</h3><ul className={styles.configList}>
          <li>📅 Inicio: {config?.start_datetime ? new Date(config.start_datetime).toLocaleString() : '-'}</li>
          <li>⏱️ Duración: {config?.match_duration_minutes || 45} min + {config?.buffer_minutes || 0} min</li>
          <li>🏟️ Pistas disponibles: {config?.num_courts || 1}</li>
          <li>👥 Formato: {config?.match_format === 'double' ? 'Ida y Vuelta' : 'Solo Ida'}</li>
        </ul></Card>
        <Card className={styles.controlCard}><h3>🚀 Ejecutar Algoritmo</h3><p>Scheduler optimizado: maximización de pistas, separación lógica jugador/árbitro y sin bloqueos artificiales.</p>
          <Button onClick={() => setConfirmDialog({ open: true, action: 'draw', message: '¿Generar nuevo calendario?' })} loading={loading} variant="primary" fullWidth disabled={status === 'running' || config?.draw_completed}>{config?.draw_completed ? '✅ Ya Sorteado' : '🎲 Generar'}</Button>
          {status === 'success' && <p className={styles.successMsg}>✅ Completado.</p>}
          {status === 'error' && <p className={styles.errorMsg}>❌ Error. Revisa logs.</p>}
        </Card>
      </div>
      <div className={styles.logsContainer}><h3>📜 Registro de Ejecución</h3><div className={styles.logs}>{logs.map((log, i) => <p key={i} className={styles.logEntry}>{log}</p>)}{logs.length === 0 && <p className={styles.emptyLogs}>Esperando acción...</p>}</div></div>
    </div>
  );
}