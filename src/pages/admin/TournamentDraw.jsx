// src/pages/admin/TournamentDraw.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Button, Card } from '../../design-system/components';
import { sendToTeam } from '../../lib/notifications';
import styles from './TournamentDraw.module.css';

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

const scheduleMatches = (matchesToSchedule, config, groupsWithTeams, onLog) => {
  const { num_courts, match_duration_minutes = 45, buffer_minutes = 0, start_datetime } = config;
  const duration = (match_duration_minutes + buffer_minutes) * 60000;
  
  let currentTime = new Date(start_datetime).getTime();
  let queue = [...matchesToSchedule];
  let scheduled = [];
  let teamBusyUntil = {};
  let safetyCounter = 0;
  const MAX_ITER = 5000;

  while (queue.length > 0) {
    safetyCounter++;
    if (safetyCounter > MAX_ITER) throw new Error("Bloqueo global en planificación.");

    let matchesThisSlot = [];
    let usedTeamsThisSlot = new Set();
    let anyPlaced = false;

    for (let court = 1; court <= num_courts; court++) {
      const matchIdx = queue.findIndex(m => {
        const homeFree = (teamBusyUntil[m.home_team_id] || 0) <= currentTime;
        const awayFree = (teamBusyUntil[m.away_team_id] || 0) <= currentTime;
        return homeFree && awayFree && !usedTeamsThisSlot.has(m.home_team_id) && !usedTeamsThisSlot.has(m.away_team_id);
      });

      if (matchIdx === -1) continue;

      const match = queue.splice(matchIdx, 1)[0];
      const endTime = currentTime + duration;

      const { _idx, ...cleanMatch } = match;
      cleanMatch.court_number = court;
      cleanMatch.match_date = new Date(currentTime).toISOString();
      cleanMatch.verification_code = Math.random().toString(36).substring(2, 8).toUpperCase();

      const allTeams = groupsWithTeams.flatMap(g => g.teams);
      const possibleRefs = allTeams.filter(t => {
        const notPlaying = t.id !== match.home_team_id && t.id !== match.away_team_id;
        const notBusy = (teamBusyUntil[t.id] || 0) <= currentTime;
        const notUsed = !usedTeamsThisSlot.has(t.id);
        return notPlaying && notBusy && notUsed;
      });

      if (possibleRefs.length > 0) {
        const randomRef = possibleRefs[Math.floor(Math.random() * possibleRefs.length)];
        cleanMatch.referee_team_id = randomRef.id;
        teamBusyUntil[randomRef.id] = endTime;
        usedTeamsThisSlot.add(randomRef.id);
      } else {
        const relaxedRefs = allTeams.filter(t => t.id !== match.home_team_id && t.id !== match.away_team_id);
        if (relaxedRefs.length > 0) {
          const randomRef = relaxedRefs[Math.floor(Math.random() * relaxedRefs.length)];
          cleanMatch.referee_team_id = randomRef.id;
        }
      }

      teamBusyUntil[match.home_team_id] = endTime;
      teamBusyUntil[match.away_team_id] = endTime;
      usedTeamsThisSlot.add(match.home_team_id);
      usedTeamsThisSlot.add(match.away_team_id);

      matchesThisSlot.push(cleanMatch);
      anyPlaced = true;

      if (scheduled.length < 5) onLog(`🏟️ Pista ${court} | ${match.home_team_id.slice(0,4)} vs ${match.away_team_id.slice(0,4)}`);
    }

    if (!anyPlaced) {
      const futureTimes = Object.values(teamBusyUntil).filter(t => t > currentTime);
      currentTime = futureTimes.length > 0 ? Math.min(...futureTimes) : currentTime + duration;
    } else {
      scheduled.push(...matchesThisSlot);
      currentTime += duration;
    }
  }
  return scheduled;
};

export default function TournamentDraw() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('idle');
  const [config, setConfig] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null, message: '' });

  useEffect(() => { fetchConfig(); }, []);

  const fetchConfig = async () => {
    const { data, error } = await supabase.from('tournament_config').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error && error.code !== 'PGRST116') console.error('Fetch config error:', error);
    if (data) setConfig(data);
  };

  const addLog = useCallback((msg) => {
    const timestamp = `[${safeTime(new Date())}]`;
    setLogs(prev => [`${timestamp} ${msg}`, ...prev].slice(0, 100));
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
      if (!config?.start_datetime || !config?.num_groups || !config?.num_courts) throw new Error("Falta configuración obligatoria.");

      addLog("📋 Obteniendo equipos aceptados...");
      const { data: teams, error: errTeams } = await supabase.from('profiles').select('id, team_name').eq('status', 'accepted').order('team_name');
      if (errTeams) throw new Error('Error BD: ' + errTeams.message);
      if (!teams || teams.length < 2) throw new Error("Se necesitan al menos 2 equipos aceptados.");
      addLog(`✅ ${teams.length} equipos listos.`);

      const safeId = '00000000-0000-0000-0000-000000000000';
      addLog("🧹 Limpiando datos anteriores...");
      const { error: e1 } = await supabase.from('matches').delete().neq('id', safeId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('group_assignments').delete().neq('id', safeId);
      if (e2) throw e2;
      const { error: e3 } = await supabase.from('groups').delete().neq('id', safeId);
      if (e3) throw e3;

      addLog("📂 Creando grupos oficiales...");
      const groupsPayload = Array.from({ length: config.num_groups }, (_, i) => ({ name: `Grupo ${String.fromCharCode(65 + i)}`, draw_order: i + 1 }));
      const { data: createdGroups, error: errGrp } = await supabase.from('groups').insert(groupsPayload).select('id, name, draw_order');
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

      addLog("⚔️ Generando cruces...");
      let allMatchesToSchedule = [];
      let matchCounter = 0;
      groupsWithTeams.forEach(group => {
        const t = group.teams;
        for (let i = 0; i < t.length; i++) {
          for (let j = i + 1; j < t.length; j++) {
            const base = { _idx: matchCounter++, group_id: group.id, home_team_id: t[i].id, away_team_id: t[j].id, status: 'scheduled', home_score: 0, away_score: 0, points_to_win: config.points_to_win || 25, sets_to_win: config.sets_to_win || 2 };
            allMatchesToSchedule.push(base);
            if (config.match_format === 'double') {
              allMatchesToSchedule.push({ ...base, _idx: matchCounter++, home_team_id: t[j].id, away_team_id: t[i].id });
            }
          }
        }
      });
      addLog(`📅 ${allMatchesToSchedule.length} partidos generados.`);

      addLog("🕒 Planificando horarios (Con árbitros globales)...");
      const scheduledMatches = scheduleMatches(allMatchesToSchedule, config, groupsWithTeams, addLog);
      
      addLog("💾 Guardando calendario...");
      const { error: errInsert } = await supabase.from('matches').insert(scheduledMatches);
      if (errInsert) throw new Error('Error guardando: ' + errInsert.message);

      const { error: errUpdate } = await supabase.from('tournament_config').update({ draw_completed: true }).neq('id', safeId);
      if (errUpdate) throw new Error('Error actualizando config: ' + errUpdate.message);

      // 🔔 NOTIFICAR A TODOS LOS EQUIPOS
      const { data: teamIds } = await supabase.from('group_assignments').select('team_id');
      if (teamIds) {
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
        <Card className={styles.controlCard}><h3>🚀 Ejecutar Algoritmo</h3><p>Árbitros globales + fallback relajado para 0 partidos sin arbitraje.</p>
          <Button onClick={() => setConfirmDialog({ open: true, action: 'draw', message: '¿Generar nuevo calendario?' })} loading={loading} variant="primary" fullWidth disabled={status === 'running' || config?.draw_completed}>{config?.draw_completed ? '✅ Ya Sorteado' : '🎲 Generar'}</Button>
          {status === 'success' && <p className={styles.successMsg}>✅ Completado.</p>}
          {status === 'error' && <p className={styles.errorMsg}>❌ Error. Revisa logs.</p>}
        </Card>
      </div>
      <div className={styles.logsContainer}><h3>📜 Registro de Ejecución</h3><div className={styles.logs}>{logs.map((log, i) => <p key={i} className={styles.logEntry}>{log}</p>)}{logs.length === 0 && <p className={styles.emptyLogs}>Esperando acción...</p>}</div></div>
    </div>
  );
}