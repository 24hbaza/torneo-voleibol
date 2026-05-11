import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Button, Card } from '../../design-system/components';
import { sendToTeam } from '../../lib/notifications';
import { generateKnockoutPhases } from '../../lib/tournament/knockoutGenerator';
import { getQualifiedTeams } from '../../lib/tournament/standingsCalculator';
import styles from './TournamentDraw.module.css';

// ============================================================================
// 🛡️ UTILIDADES
// ============================================================================

const safeTime = function(dateInput) {
  try {
    return new Date(dateInput).toLocaleTimeString('es-ES', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  } catch (error) {
    return '00:00';
  }
};

const shuffleArray = function(array) {
  var arr = [...array];
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
};

// ============================================================================
// 🧠 GENERADOR DE JORNADAS ROUND-ROBIN
// ============================================================================

const generateRoundRobinMatches = function(teams, isDouble) {
  var n = teams.length;
  var teamsCopy = [...teams];
  
  if (n % 2 !== 0) {
    teamsCopy = [...teamsCopy, { id: 'bye', team_name: 'Descansa', isBye: true }];
    n = teamsCopy.length;
  }
  
  var rounds = [];
  var numRounds = n - 1;
  var halfSize = n / 2;
  
  for (var round = 0; round < numRounds; round++) {
    var roundMatches = [];
    for (var i = 0; i < halfSize; i++) {
      var home = teamsCopy[i];
      var away = teamsCopy[n - 1 - i];
      if (!home.isBye && !away.isBye) {
        roundMatches.push({ home: home.id, away: away.id });
      }
    }
    rounds.push(roundMatches);
    
    // Rotación para siguiente ronda
    var first = teamsCopy[0];
    var rest = teamsCopy.slice(1);
    teamsCopy = [first].concat(rest.slice(1), [rest[0]]);
  }
  
  if (isDouble) {
    var returnRounds = rounds.map(function(round) {
      return round.map(function(match) {
        return { home: match.away, away: match.home };
      });
    });
    rounds = rounds.concat(returnRounds);
  }
  
  return rounds;
};

// ============================================================================
// 🧠 SCHEDULER ULTRA OPTIMIZADO CON RESTRICCIÓN ADMIN TEAMS
// ============================================================================

const scheduleMatches = function(groupsWithTeams, config, onLog) {
  var num_courts = config.num_courts;
  var match_duration_minutes = config.match_duration_minutes || 45;
  var buffer_minutes = config.buffer_minutes || 0;
  var start_datetime = config.start_datetime;
  var match_format = config.match_format;

  var duration = (match_duration_minutes + buffer_minutes) * 60000;
  var currentTime = new Date(start_datetime).getTime();
  var scheduled = [];

  // Estado de equipos
  var teamBusyUntil = {};
  var teamLastPlayed = {};
  var teamRefereeCount = {};
  var teamPlayedCount = {};

  groupsWithTeams.forEach(function(group) {
    group.teams.forEach(function(team) {
      if (!team.isBye) {
        teamBusyUntil[team.id] = 0;
        teamLastPlayed[team.id] = 0;
        teamRefereeCount[team.id] = 0;
        teamPlayedCount[team.id] = 0;
      }
    });
  });

  // Generar partidos pendientes
  var pendingMatches = [];

  groupsWithTeams.forEach(function(group) {
    var rounds = generateRoundRobinMatches(
      group.teams,
      match_format === 'double'
    );

    rounds.forEach(function(roundMatches, roundIndex) {
      roundMatches.forEach(function(match) {
        pendingMatches.push({
          group_id: group.id,
          home_team_id: match.home,
          away_team_id: match.away,
          round: roundIndex + 1
        });
      });
    });
  });

  var allTeams = groupsWithTeams.flatMap(function(g) {
    return g.teams.filter(function(t) { return !t.isBye; });
  });

  // ============================================================================
  // 🔥 EQUIPOS ADMINISTRADORES - RESTRICCIÓN DE SIMULTANEIDAD
  // ============================================================================
  var adminTeamIds = [];
  for (var at = 0; at < allTeams.length; at++) {
    var team = allTeams[at];
    if (team.is_admin_team === true) {
      adminTeamIds.push(team.id);
    }
  }

  // ============================================================================
  // 🔥 BUCLE PRINCIPAL OPTIMIZADO
  // ============================================================================
  while (pendingMatches.length > 0) {

    var slotMatches = [];
    var slotPlayingTeams = new Set();
    var slotReferees = new Set();
    
    // ✅ NUEVO: Estado global del slot para admins (jugando O arbitrando)
    var slotAdminBusy = false;

    // ============================================================================
    // 🔥 FILTRAR PARTIDOS DISPONIBLES (solo restricciones básicas)
    // ============================================================================
    var availableMatches = pendingMatches.filter(function(match) {
      var homeFree = (teamBusyUntil[match.home_team_id] || 0) <= currentTime;
      var awayFree = (teamBusyUntil[match.away_team_id] || 0) <= currentTime;

      return (
        homeFree &&
        awayFree &&
        !slotPlayingTeams.has(match.home_team_id) &&
        !slotPlayingTeams.has(match.away_team_id)
      );
    });

    // ============================================================================
    // 🔥 HEURÍSTICA GLOBAL DE PRIORIDADES
    // ============================================================================
    availableMatches.sort(function(a, b) {
      var aWait = currentTime - Math.max(
        teamLastPlayed[a.home_team_id] || 0,
        teamLastPlayed[a.away_team_id] || 0
      );

      var bWait = currentTime - Math.max(
        teamLastPlayed[b.home_team_id] || 0,
        teamLastPlayed[b.away_team_id] || 0
      );

      var aPlayed = teamPlayedCount[a.home_team_id] + teamPlayedCount[a.away_team_id];
      var bPlayed = teamPlayedCount[b.home_team_id] + teamPlayedCount[b.away_team_id];

      // MÁS ESPERA = MÁS PRIORIDAD
      if (bWait !== aWait) {
        return bWait - aWait;
      }

      // MENOS PARTIDOS JUGADOS = MÁS PRIORIDAD
      return aPlayed - bPlayed;
    });

    // ============================================================================
    // 🔥 LLENAR TODAS LAS PISTAS POSIBLES
    // ✅ CORRECCIÓN: Validación admin con slotAdminBusy
    // ============================================================================
    for (var court = 1; court <= num_courts; court++) {
      var selectedMatch = null;
      
      for (var i = 0; i < availableMatches.length; i++) {
        var match = availableMatches[i];
        
        // ✅ Verificación básica de equipos ocupados
        if (slotPlayingTeams.has(match.home_team_id) || 
            slotPlayingTeams.has(match.away_team_id)) {
          continue;
        }

        // ✅ 🔥 NUEVO: Validar restricción de equipos admin con estado global
        var matchHasAdmin = 
          adminTeamIds.indexOf(match.home_team_id) !== -1 || 
          adminTeamIds.indexOf(match.away_team_id) !== -1;

        // ⛔ Si el partido tiene admin Y el slot ya tiene un admin ocupado → saltar
        if (matchHasAdmin && slotAdminBusy) {
          continue;
        }

        selectedMatch = match;
        break;
      }

      if (!selectedMatch) {
        break;
      }

      slotMatches.push({ ...selectedMatch, court: court });
      slotPlayingTeams.add(selectedMatch.home_team_id);
      slotPlayingTeams.add(selectedMatch.away_team_id);

      // ✅ 🔥 Si el partido seleccionado tiene admin → marcar slot ocupado
      if (
        adminTeamIds.indexOf(selectedMatch.home_team_id) !== -1 ||
        adminTeamIds.indexOf(selectedMatch.away_team_id) !== -1
      ) {
        slotAdminBusy = true;
      }

      var idx = availableMatches.indexOf(selectedMatch);
      if (idx !== -1) {
        availableMatches.splice(idx, 1);
      }
    }

    // Si no se pudo programar nada → avanzar tiempo
    if (slotMatches.length === 0) {
      var nextFree = Object.values(teamBusyUntil).filter(function(t) {
        return t > currentTime;
      });

      if (nextFree.length > 0) {
        currentTime = Math.min.apply(null, nextFree);
      } else {
        currentTime = currentTime + duration;
      }
      continue;
    }

    // Eliminar pendientes ya usados
    var newPending = [];
    for (var p = 0; p < pendingMatches.length; p++) {
      var pm = pendingMatches[p];
      var isUsed = false;
      for (var s = 0; s < slotMatches.length; s++) {
        var sm = slotMatches[s];
        if (sm.home_team_id === pm.home_team_id &&
            sm.away_team_id === pm.away_team_id &&
            sm.round === pm.round) {
          isUsed = true;
          break;
        }
      }
      if (!isUsed) {
        newPending.push(pm);
      }
    }
    pendingMatches = newPending;

    var endTime = currentTime + duration;

    // ============================================================================
    // 🔥 CREAR PARTIDOS CON ÁRBITROS BALANCEADOS
    // ============================================================================
    for (var m = 0; m < slotMatches.length; m++) {
      var match = slotMatches[m];

      var groupTeams = null;
      for (var g = 0; g < groupsWithTeams.length; g++) {
        if (groupsWithTeams[g].id === match.group_id) {
          groupTeams = groupsWithTeams[g].teams;
          break;
        }
      }
      if (!groupTeams) {
        groupTeams = [];
      }

      // 🔥 ÁRBITROS: Primero del mismo grupo, priorizando admins si están disponibles
      var possibleRefs = [];
      for (var t = 0; t < groupTeams.length; t++) {
        var team = groupTeams[t];
        if (!team.isBye &&
            team.id !== match.home_team_id &&
            team.id !== match.away_team_id &&
            !slotPlayingTeams.has(team.id) &&
            !slotReferees.has(team.id) &&
            (teamBusyUntil[team.id] || 0) <= currentTime) {
          
          // ✅ 🔥 BLOQUEAR árbitro admin si ya hay admin ocupado en el slot
          var refIsAdmin = adminTeamIds.indexOf(team.id) !== -1;
          if (refIsAdmin && slotAdminBusy) {
            continue;
          }
          
          possibleRefs.push(team);
        }
      }

      // Si no hay del grupo → buscar en todos
      if (possibleRefs.length === 0) {
        for (var at = 0; at < allTeams.length; at++) {
          var team = allTeams[at];
          if (team.id !== match.home_team_id &&
              team.id !== match.away_team_id &&
              !slotPlayingTeams.has(team.id) &&
              !slotReferees.has(team.id) &&
              (teamBusyUntil[team.id] || 0) <= currentTime) {
            
            // ✅ 🔥 BLOQUEAR árbitro admin si ya hay admin ocupado en el slot (búsqueda global)
            var refIsAdmin = adminTeamIds.indexOf(team.id) !== -1;
            if (refIsAdmin && slotAdminBusy) {
              continue;
            }
            
            possibleRefs.push(team);
          }
        }
      }

      // 🔥 BALANCEO REAL: Priorizar admins, luego menos arbitrajes, luego menos partidos jugados
      possibleRefs.sort(function(a, b) {
        // Primero: equipos admin tienen prioridad para arbitrar
        var aIsAdmin = adminTeamIds.indexOf(a.id) !== -1 ? 1 : 0;
        var bIsAdmin = adminTeamIds.indexOf(b.id) !== -1 ? 1 : 0;
        if (bIsAdmin !== aIsAdmin) {
          return bIsAdmin - aIsAdmin;
        }
        // Segundo: menos arbitrajes previos
        var diff = teamRefereeCount[a.id] - teamRefereeCount[b.id];
        if (diff !== 0) {
          return diff;
        }
        // Tercero: menos partidos jugados
        return teamPlayedCount[a.id] - teamPlayedCount[b.id];
      });

      var referee = possibleRefs.length > 0 ? possibleRefs[0] : null;

      if (referee) {
        slotReferees.add(referee.id);
        teamRefereeCount[referee.id] = teamRefereeCount[referee.id] + 1;
        
        // ✅ 🔥 Si el árbitro es admin → marcar slot ocupado
        if (adminTeamIds.indexOf(referee.id) !== -1) {
          slotAdminBusy = true;
        }
      }

      scheduled.push({
        group_id: match.group_id,
        home_team_id: match.home_team_id,
        away_team_id: match.away_team_id,
        round: match.round,
        court_number: match.court,
        referee_team_id: referee ? referee.id : null,
        match_date: new Date(currentTime).toISOString(),
        verification_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
        status: 'scheduled',
        home_score: 0,
        away_score: 0,
        points_to_win: config.points_to_win || 25,
        sets_to_win: config.sets_to_win || 2,
        phase: 'group' // Fase de grupos inicial
      });

      // 🔥 Actualizar estados SOLO por jugar (no por arbitrar)
      teamBusyUntil[match.home_team_id] = endTime;
      teamBusyUntil[match.away_team_id] = endTime;
      teamLastPlayed[match.home_team_id] = endTime;
      teamLastPlayed[match.away_team_id] = endTime;
      teamPlayedCount[match.home_team_id] = teamPlayedCount[match.home_team_id] + 1;
      teamPlayedCount[match.away_team_id] = teamPlayedCount[match.away_team_id] + 1;

      onLog(
        '🏟️ P' + match.court + ' | ' + 
        match.home_team_id.slice(0, 4) + ' vs ' + 
        match.away_team_id.slice(0, 4)
      );
    }

    // Avanzar slot
    currentTime = currentTime + duration;
  }

  console.log('📊 Referees:', teamRefereeCount);
  return scheduled;
};

// ============================================================================
// 🖥️ COMPONENTE PRINCIPAL
// ============================================================================

export default function TournamentDraw() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('idle');
  const [config, setConfig] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null, message: '' });

  useEffect(function() {
    fetchConfig();
  }, []);

  const fetchConfig = async function() {
    const { data: configData, error } = await supabase
      .from('tournament_config')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Fetch config error:', error);
    }
    if (configData) {
      setConfig(configData);
    }
  };

  const addLog = useCallback(function(msg) {
    setLogs(function(prev) {
      var newLogs = ['[' + safeTime(new Date()) + '] ' + msg].concat(prev);
      return newLogs.slice(0, 100);
    });
  }, []);

  const handleConfirm = useCallback(async function() {
    setConfirmDialog(function(prev) {
      return { ...prev, open: false };
    });
    
    if (confirmDialog.action === 'draw') {
      await executeDraw();
    }
    if (confirmDialog.action === 'reset') {
      await resetDraw();
    }
  }, [confirmDialog]);

  const executeDraw = async function() {
    setLoading(true);
    setStatus('running');
    setLogs([]);
    addLog('🚀 Iniciando proceso de sorteo...');

    try {
      if (!config?.start_datetime || !config?.num_groups || !config?.num_courts) {
        throw new Error('Falta configuración obligatoria.');
      }

      addLog('📋 Obteniendo equipos aceptados...');
      
      const { data: teams, error: errTeams } = await supabase
        .from('profiles')
        .select('id, team_name, is_admin_team')
        .eq('status', 'accepted')
        .order('team_name');
      
      if (errTeams) {
        throw new Error('Error BD: ' + errTeams.message);
      }
      if (!teams || teams.length < 2) {
        throw new Error('Se necesitan al menos 2 equipos aceptados.');
      }
      addLog('✅ ' + teams.length + ' equipos listos.');

      var safeId = '00000000-0000-0000-0000-000000000000';
      
      addLog('🧹 Limpiando datos anteriores...');
      var { error: e1 } = await supabase.from('matches').delete().neq('id', safeId);
      if (e1) throw e1;
      
      var { error: e2 } = await supabase.from('group_assignments').delete().neq('id', safeId);
      if (e2) throw e2;
      
      var { error: e3 } = await supabase.from('groups').delete().neq('id', safeId);
      if (e3) throw e3;

      addLog('📂 Creando grupos oficiales...');
      var groupsPayload = [];
      for (var i = 0; i < config.num_groups; i++) {
        groupsPayload.push({ 
          name: 'Grupo ' + String.fromCharCode(65 + i), 
          draw_order: i + 1 
        });
      }
      
      const { data: createdGroups, error: errGrp } = await supabase
        .from('groups')
        .insert(groupsPayload)
        .select('id, name, draw_order');
      
      if (errGrp) {
        throw new Error('Error creando grupos: ' + errGrp.message);
      }
      if (!createdGroups) {
        throw new Error('No se recibieron IDs de grupos creados.');
      }
      addLog('✅ ' + createdGroups.length + ' grupos creados.');

      addLog('🎲 Asignando equipos (Fisher-Yates)...');
      var shuffledTeams = shuffleArray(teams);
      var assignments = [];
      var groupsWithTeams = [];
      
      for (var cg = 0; cg < createdGroups.length; cg++) {
        groupsWithTeams.push({ 
          ...createdGroups[cg], 
          teams: [] 
        });
      }

      for (var ti = 0; ti < shuffledTeams.length; ti++) {
        var team = shuffledTeams[ti];
        var groupIdx = ti % config.num_groups;
        assignments.push({ 
          group_id: groupsWithTeams[groupIdx].id, 
          team_id: team.id, 
          draw_order: ti + 1 
        });
        groupsWithTeams[groupIdx].teams.push(team);
      }

      var { error: errAssign } = await supabase.from('group_assignments').insert(assignments);
      if (errAssign) {
        throw new Error('Error asignando equipos: ' + errAssign.message);
      }
      addLog('✅ Distribución completada.');

      addLog('⚔️ Generando horarios por slots optimizados...');
      var finalScheduled = scheduleMatches(groupsWithTeams, config, addLog);
      
      addLog('💾 Guardando calendario de fase de grupos...');
      var { error: errInsert } = await supabase.from('matches').insert(finalScheduled);
      if (errInsert) {
        throw new Error('Error guardando: ' + errInsert.message);
      }

      // ========================================================================
      // 🔥 NUEVO: GENERAR FASE ELIMINATORIA (Grupos Z/W + Semifinales + Final)
      // ========================================================================
      
      // Verificar si hay configuración para fase eliminatoria
      // Asumimos que si teams_advancing existe y es > 0, generamos eliminatoria
      var teamsAdvancing = config.teams_advancing || 2; // Por defecto 2 por grupo
      var totalQualified = createdGroups.length * teamsAdvancing;
      
      if (totalQualified === 8) {
        addLog('🔄 Generando fase eliminatoria con ' + totalQualified + ' equipos...');
        
        // NOTA: En un entorno real, aquí esperaríamos a que terminen los grupos
        // Para este ejemplo, generamos la estructura pero con status 'pending'
        // que se activará cuando los grupos terminen
        
        // Crear estructura de grupos Z y W (placeholders)
        var groupZ = {
          id: 'group_z_knockout',
          name: 'Grupo Z (Fase Eliminatoria)',
          teams: [] // Se llenará cuando terminen los grupos
        };
        
        var groupW = {
          id: 'group_w_knockout',
          name: 'Grupo W (Fase Eliminatoria)',
          teams: [] // Se llenará cuando terminen los grupos
        };
        
        // Generar partidos de semifinales y final (placeholders)
        var knockoutMatches = [
          // Semifinal 1: 1º Z vs 2º W
          {
            group_id: null,
            group_name: 'Fase Final',
            home_team_id: 'winner_group_z_1st',
            away_team_id: 'winner_group_w_2nd',
            home_team_name: '1º Clasificado Grupo Z',
            away_team_name: '2º Clasificado Grupo W',
            round: 1,
            phase: 'knockout_final',
            match_type: 'semifinal_1',
            status: 'pending',
            match_date: null,
            court_number: null,
            referee_team_id: null,
            home_score: null,
            away_score: null,
            winner_team_id: null,
            verification_code: null,
            sets_details: [],
            points_to_win: config.points_to_win || 25,
            sets_to_win: config.sets_to_win || 2
          },
          // Semifinal 2: 2º Z vs 1º W
          {
            group_id: null,
            group_name: 'Fase Final',
            home_team_id: 'winner_group_z_2nd',
            away_team_id: 'winner_group_w_1st',
            home_team_name: '2º Clasificado Grupo Z',
            away_team_name: '1º Clasificado Grupo W',
            round: 1,
            phase: 'knockout_final',
            match_type: 'semifinal_2',
            status: 'pending',
            match_date: null,
            court_number: null,
            referee_team_id: null,
            home_score: null,
            away_score: null,
            winner_team_id: null,
            verification_code: null,
            sets_details: [],
            points_to_win: config.points_to_win || 25,
            sets_to_win: config.sets_to_win || 2
          },
          // Final
          {
            group_id: null,
            group_name: 'Fase Final',
            home_team_id: 'winner_sf1',
            away_team_id: 'winner_sf2',
            home_team_name: 'Ganador Semifinal 1',
            away_team_name: 'Ganador Semifinal 2',
            round: 2,
            phase: 'knockout_final',
            match_type: 'final',
            status: 'pending',
            match_date: null,
            court_number: null,
            referee_team_id: null,
            home_score: null,
            away_score: null,
            winner_team_id: null,
            verification_code: null,
            sets_details: [],
            points_to_win: config.points_to_win || 25,
            sets_to_win: config.sets_to_win || 2
          },
          // 3er y 4to puesto
          {
            group_id: null,
            group_name: 'Fase Final',
            home_team_id: 'loser_sf1',
            away_team_id: 'loser_sf2',
            home_team_name: 'Perdedor Semifinal 1',
            away_team_name: 'Perdedor Semifinal 2',
            round: 2,
            phase: 'knockout_final',
            match_type: 'third_place',
            status: 'pending',
            match_date: null,
            court_number: null,
            referee_team_id: null,
            home_score: null,
            away_score: null,
            winner_team_id: null,
            verification_code: null,
            sets_details: [],
            points_to_win: config.points_to_win || 25,
            sets_to_win: config.sets_to_win || 2
          }
        ];
        
        // Guardar partidos de fase final (pendientes)
        if (knockoutMatches.length > 0) {
          var { error: errKnockout } = await supabase
            .from('matches')
            .insert(knockoutMatches);
          
          if (errKnockout) {
            console.warn('⚠️ Error guardando fase final:', errKnockout);
            addLog('⚠️ Fase final generada pero no guardada completamente');
          } else {
            addLog('✅ Fase eliminatoria (semifinales + final) creada');
          }
        }
      } else {
        addLog('ℹ️ No se generan 8 equipos clasificados. Total: ' + totalQualified);
      }

      var { error: errUpdate } = await supabase
        .from('tournament_config')
        .update({ draw_completed: true })
        .neq('id', safeId);
      
      if (errUpdate) {
        throw new Error('Error actualizando config: ' + errUpdate.message);
      }

      // 🔔 Notificaciones
      const { data: teamIds, error: teamErr } = await supabase
        .from('group_assignments')
        .select('team_id');
      
      if (!teamErr && teamIds) {
        var uniqueIds = [];
        for (var tid = 0; tid < teamIds.length; tid++) {
          var id = teamIds[tid].team_id;
          if (uniqueIds.indexOf(id) === -1) {
            uniqueIds.push(id);
          }
        }
        
        for (var uid = 0; uid < uniqueIds.length; uid++) {
          await sendToTeam(
            uniqueIds[uid], 
            'match_scheduled', 
            '📅 Calendario Publicado', 
            'Ya puedes ver tus partidos y horarios en "Mis Partidos".', 
            '/dashboard/partidos'
          );
        }
      }

      setStatus('success');
      addLog('🎉 ¡SORTEO COMPLETADO!');

    } catch (err) {
      console.error('Draw Error:', err);
      setStatus('error');
      addLog('❌ ERROR: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetDraw = async function() {
    setLoading(true);
    addLog('🔄 Reiniciando sorteo...');
    var safeId = '00000000-0000-0000-0000-000000000000';
    
    try {
      var { error: e1 } = await supabase.from('matches').delete().neq('id', safeId);
      if (e1) throw e1;
      
      var { error: e2 } = await supabase.from('group_assignments').delete().neq('id', safeId);
      if (e2) throw e2;
      
      var { error: e3 } = await supabase.from('groups').delete().neq('id', safeId);
      if (e3) throw e3;
      
      var { error: e4 } = await supabase
        .from('tournament_config')
        .update({ draw_completed: false })
        .neq('id', safeId);
      
      if (e4) throw e4;
      
      setStatus('idle');
      setLogs([]);
      addLog('✅ Sorteo reiniciado.');
      
    } catch (err) {
      addLog('❌ Error en reset: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {confirmDialog.open && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>⚠️ Confirmar Acción</h3>
            <p>{confirmDialog.message}</p>
            <div className={styles.modalActions}>
              <Button 
                variant="ghost" 
                onClick={function() {
                  setConfirmDialog(function(p) {
                    return { ...p, open: false };
                  });
                }}
              >
                Cancelar
              </Button>
              <Button 
                variant="danger" 
                onClick={handleConfirm} 
                loading={loading}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
      
      <header className={styles.header}>
        <h1 className={styles.title}>🎲 Sorteo y Calendario</h1>
        {config?.draw_completed && (
          <Button 
            variant="danger" 
            onClick={function() {
              setConfirmDialog({ 
                open: true, 
                action: 'reset', 
                message: '¿Borrar sorteo y grupos?' 
              });
            }} 
            disabled={loading}
          >
            🗑️ Reiniciar
          </Button>
        )}
      </header>
      
      <div className={styles.infoGrid}>
        <Card>
          <h3>📊 Configuración Activa</h3>
          <ul className={styles.configList}>
            <li>📅 Inicio: {config?.start_datetime ? new Date(config.start_datetime).toLocaleString() : '-'}</li>
            <li>⏱️ Duración: {config?.match_duration_minutes || 45} min + {config?.buffer_minutes || 0} min</li>
            <li>🏟️ Pistas disponibles: {config?.num_courts || 1}</li>
            <li>👥 Formato: {config?.match_format === 'double' ? 'Ida y Vuelta' : 'Solo Ida'}</li>
            <li>🎟️ Equipos que avanzan: {config?.teams_advancing || 2} por grupo</li>
          </ul>
        </Card>
        
        <Card className={styles.controlCard}>
          <h3>🚀 Ejecutar Algoritmo</h3>
          <p>Scheduler optimizado: maximización de pistas, separación lógica jugador/árbitro, equipos administradores y sin bloqueos artificiales.</p>
          <Button 
            onClick={function() {
              setConfirmDialog({ 
                open: true, 
                action: 'draw', 
                message: '¿Generar nuevo calendario?' 
              });
            }} 
            loading={loading} 
            variant="primary" 
            fullWidth 
            disabled={status === 'running' || config?.draw_completed}
          >
            {config?.draw_completed ? '✅ Ya Sorteado' : '🎲 Generar'}
          </Button>
          {status === 'success' && <p className={styles.successMsg}>✅ Completado.</p>}
          {status === 'error' && <p className={styles.errorMsg}>❌ Error. Revisa logs.</p>}
        </Card>
      </div>
      
      <div className={styles.logsContainer}>
        <h3>📜 Registro de Ejecución</h3>
        <div className={styles.logs}>
          {logs.map(function(log, i) {
            return <p key={i} className={styles.logEntry}>{log}</p>;
          })}
          {logs.length === 0 && <p className={styles.emptyLogs}>Esperando acción...</p>}
        </div>
      </div>
    </div>
  );
}