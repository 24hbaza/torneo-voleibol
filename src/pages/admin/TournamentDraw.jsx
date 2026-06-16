// src/pages/admin/TournamentDraw.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Button, Card } from '../../design-system/components';
import { sendToTeam } from '../../lib/notifications';
import { generateKnockoutPhases } from '../../lib/tournament/knockoutGenerator';
import { getQualifiedTeams } from '../../lib/tournament/standingsCalculator';
import styles from './TournamentDraw.module.css';

// ============================================================================
// ️ UTILIDADES
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
// ✅ NUEVA FUNCIÓN: VERIFICAR DISPONIBILIDAD DE UN EQUIPO (FECHAS COMPLETAS)
// ============================================================================

/**
 * Verifica si un equipo puede jugar en una fecha/hora específica
 * @param {Object} team - Objeto del equipo con campo availability
 * @param {Date} matchDate - Fecha y hora del partido
 * @returns {boolean} - true si puede jugar, false si no está disponible
 */
const canTeamPlay = function(team, matchDate) {
  // Si no tiene disponibilidad definida, puede jugar siempre
  if (!team.availability || !Array.isArray(team.availability) || team.availability.length === 0) {
    return true;
  }
  
  const matchTime = matchDate.getTime();
  
  // Verificar cada franja de no disponibilidad
  for (let i = 0; i < team.availability.length; i++) {
    const avail = team.availability[i];
    
    if (!avail.start_datetime || !avail.end_datetime) {
      continue;
    }
    
    const startDateTime = new Date(avail.start_datetime).getTime();
    const endDateTime = new Date(avail.end_datetime).getTime();
    
    // Verificar si la hora del partido está dentro de la franja
    if (matchTime >= startDateTime && matchTime < endDateTime) {
      // El partido cae en una franja de no disponibilidad
      return false;
    }
  }
  
  // Si no está en ninguna franja de no disponibilidad, puede jugar
  return true;
};

// ============================================================================
// ✅ NUEVA FUNCIÓN: VERIFICAR FRANJA HORARIA GLOBAL SIN PARTIDOS (21:00 - 21:30)
// ============================================================================

/**
 * Verifica si una hora está dentro de la franja horaria global sin partidos
 * Franja: 21:00 a 21:30 todos los días
 * @param {Date} date - Fecha y hora a verificar
 * @returns {boolean} - true si está en la franja prohibida
 */
const isBlackoutTime = function(date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  // 21:00 = 1260 minutos, 21:30 = 1290 minutos
  const blackoutStart = 21 * 60 + 0;  // 21:00
  const blackoutEnd = 21 * 60 + 30;   // 21:30
  
  return timeInMinutes >= blackoutStart && timeInMinutes < blackoutEnd;
};

/**
 * Si la hora actual está en la franja prohibida, avanza hasta las 21:30
 * @param {number} currentTime - Timestamp actual
 * @returns {number} - Timestamp ajustado (21:30 si estaba en la franja)
 */
const skipBlackout = function(currentTime) {
  const date = new Date(currentTime);
  
  if (isBlackoutTime(date)) {
    // Avanzar a las 21:30 del mismo día
    date.setHours(21, 30, 0, 0);
    return date.getTime();
  }
  
  return currentTime;
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
// 🧠 SCHEDULER ULTRA OPTIMIZADO CON DISPONIBILIDAD Y FRANJA SIN PARTIDOS
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

  // ✅ Saltar franja horaria inicial si coincide
  currentTime = skipBlackout(currentTime);

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
  // 🔥 EQUIPOS ADMINISTRADORES - IDENTIFICACIÓN (sin restricción de arbitraje)
  // ============================================================================
  var adminTeamIds = [];
  for (var at = 0; at < allTeams.length; at++) {
    var team = allTeams[at];
    if (team.is_admin_team === true) {
      adminTeamIds.push(team.id);
    }
  }

  // ============================================================================
  // 🔥 BUCLE PRINCIPAL OPTIMIZADO CON DISPONIBILIDAD
  // ============================================================================
  var maxAttempts = 1000; // Límite de seguridad para evitar bucles infinitos
  var attempts = 0;
  
  while (pendingMatches.length > 0 && attempts < maxAttempts) {
    attempts++;
    
    // ✅ Saltar franja horaria si coincide
    currentTime = skipBlackout(currentTime);
    
    var slotMatches = [];
    var slotPlayingTeams = new Set();
    var slotReferees = new Set();

    // ✅ Fecha y hora del slot actual para verificar disponibilidad
    var slotDate = new Date(currentTime);

    // ============================================================================
    // 🔥 FILTRAR PARTIDOS DISPONIBLES (restricciones básicas + disponibilidad)
    // ============================================================================
    var availableMatches = pendingMatches.filter(function(match) {
      var homeFree = (teamBusyUntil[match.home_team_id] || 0) <= currentTime;
      var awayFree = (teamBusyUntil[match.away_team_id] || 0) <= currentTime;

      // ✅ Verificar disponibilidad horaria
      var homeTeam = allTeams.find(function(t) { return t.id === match.home_team_id; });
      var awayTeam = allTeams.find(function(t) { return t.id === match.away_team_id; });
      
      var homeAvailable = canTeamPlay(homeTeam, slotDate);
      var awayAvailable = canTeamPlay(awayTeam, slotDate);

      return (
        homeFree &&
        awayFree &&
        homeAvailable &&
        awayAvailable &&
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

        selectedMatch = match;
        break;
      }

      if (!selectedMatch) {
        break;
      }

      slotMatches.push({ ...selectedMatch, court: court });
      slotPlayingTeams.add(selectedMatch.home_team_id);
      slotPlayingTeams.add(selectedMatch.away_team_id);

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
            
            possibleRefs.push(team);
          }
        }
      }

      // 🔥 BALANCEO REAL: Priorizar admins, luego menos arbitrajes, luego menos partidos jugados
      possibleRefs.sort(function(a, b) {
        var aIsAdmin = adminTeamIds.indexOf(a.id) !== -1 ? 1 : 0;
        var bIsAdmin = adminTeamIds.indexOf(b.id) !== -1 ? 1 : 0;
        if (bIsAdmin !== aIsAdmin) {
          return bIsAdmin - aIsAdmin;
        }
        var diff = teamRefereeCount[a.id] - teamRefereeCount[b.id];
        if (diff !== 0) {
          return diff;
        }
        return teamPlayedCount[a.id] - teamPlayedCount[b.id];
      });

      var referee = possibleRefs.length > 0 ? possibleRefs[0] : null;

      if (referee) {
        slotReferees.add(referee.id);
        teamRefereeCount[referee.id] = teamRefereeCount[referee.id] + 1;
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
        phase: 'group'
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

  if (attempts >= maxAttempts) {
    onLog('⚠️ Se alcanzó el límite de intentos. Algunos partidos podrían no haberse programado.');
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
      // ✅ DEBUG: Ver qué hay en config
      console.log('🔍 Configuración actual:', config);
      
      // ✅ Validación mejorada con mensajes específicos
      const missingFields = [];
      
      if (!config?.start_datetime) {
        missingFields.push('Fecha y hora de inicio');
      }
      if (!config?.num_groups) {
        missingFields.push('Número de grupos');
      }
      if (!config?.num_courts) {
        missingFields.push('Número de pistas');
      }
      
      if (missingFields.length > 0) {
        const errorMsg = 'Falta configuración obligatoria:\n\n' + missingFields.join('\n') + '\n\nVe a "Configuración" y completa estos campos.';
        console.error('❌ ' + errorMsg);
        throw new Error(errorMsg);
      }

      addLog('📋 Obteniendo equipos aceptados...');
      
      const { data: teams, error: errTeams } = await supabase
        .from('profiles')
        .select('id, team_name, is_admin_team, availability')
        .eq('status', 'accepted')
        .order('team_name');
      
      if (errTeams) {
        throw new Error('Error BD: ' + errTeams.message);
      }
      if (!teams || teams.length < 2) {
        throw new Error('Se necesitan al menos 2 equipos aceptados.');
      }
      addLog('✅ ' + teams.length + ' equipos listos.');

      var teamsWithAvailability = teams.filter(function(t) { 
        return t.availability && t.availability.length > 0; 
      });
      if (teamsWithAvailability.length > 0) {
        addLog('⏰ ' + teamsWithAvailability.length + ' equipos tienen restricciones horarias');
      }

      var safeId = '00000000-0000-0000-0000-000000000000';
      
      addLog('🧹 Limpiando partidos anteriores...');
      var { error: e1 } = await supabase.from('matches').delete().neq('id', safeId);
      if (e1) throw e1;

      // ✅ VERIFICAR SI YA EXISTEN GRUPOS CREADOS MANUALMENTE
      addLog('🔍 Verificando grupos existentes...');
      const { data: existingGroups, error: groupsError } = await supabase
        .from('groups')
        .select('*')
        .order('draw_order');
      
      if (groupsError) {
        throw new Error('Error consultando grupos: ' + groupsError.message);
      }

      var groupsWithTeams = [];
      var usingManualGroups = false;

      // ✅ SI EXISTEN GRUPOS, VERIFICAR SI TIENEN ASIGNACIONES
      if (existingGroups && existingGroups.length > 0) {
        addLog('📂 Encontrados ' + existingGroups.length + ' grupos existentes');
        
        const { data: existingAssignments, error: assignmentsError } = await supabase
          .from('group_assignments')
          .select('group_id, team_id')
          .in('group_id', existingGroups.map(g => g.id));
        
        if (assignmentsError) {
          throw new Error('Error consultando asignaciones: ' + assignmentsError.message);
        }

        // ✅ SI HAY ASIGNACIONES, USAR LOS GRUPOS MANUALES
        if (existingAssignments && existingAssignments.length > 0) {
          usingManualGroups = true;
          addLog('✅ Usando grupos asignados manualmente (' + existingAssignments.length + ' equipos asignados)');
          
          // Construir estructura groupsWithTeams con los grupos existentes
          existingGroups.forEach(group => {
            const groupTeamIds = existingAssignments
              .filter(a => a.group_id === group.id)
              .map(a => a.team_id);
            
            const groupTeams = groupTeamIds.map(teamId => {
              const team = teams.find(t => t.id === teamId);
              return team || { id: teamId, team_name: 'Equipo desconocido' };
            });
            
            groupsWithTeams.push({
              ...group,
              teams: groupTeams
            });
          });
          
          addLog('✅ ' + groupsWithTeams.length + ' grupos cargados con equipos asignados');
        } else {
          addLog('⚠️ Grupos encontrados pero sin asignaciones. Creando grupos aleatorios...');
        }
      }

      // ✅ SI NO HAY GRUPOS MANUALES, CREARLOS ALEATORIAMENTE
      if (!usingManualGroups) {
        addLog('🧹 Limpiando grupos y asignaciones anteriores...');
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
        addLog('✅ Distribución aleatoria completada.');
      }

      addLog('⚔️ Generando horarios por slots optimizados (respetando disponibilidad y franja 21:00-21:30)...');
      var finalScheduled = scheduleMatches(groupsWithTeams, config, addLog);
      
      addLog('💾 Guardando calendario de fase de grupos...');
      var { error: errInsert } = await supabase.from('matches').insert(finalScheduled);
      if (errInsert) {
        throw new Error('Error guardando: ' + errInsert.message);
      }

      // ========================================================================
      // 🔥 NUEVO: GENERAR FASE ELIMINATORIA (Grupos Z/W + Semifinales + Final)
      // ========================================================================
      
      var teamsAdvancing = config.teams_advancing || 2;
      var totalQualified = groupsWithTeams.length * teamsAdvancing;
      
      if (totalQualified === 8) {
        addLog('🔄 Generando fase eliminatoria con ' + totalQualified + ' equipos...');
        
        var groupZ = {
          id: 'group_z_knockout',
          name: 'Grupo Z (Fase Eliminatoria)',
          teams: []
        };
        
        var groupW = {
          id: 'group_w_knockout',
          name: 'Grupo W (Fase Eliminatoria)',
          teams: []
        };
        
        var knockoutMatches = [
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
            <li>🚫 Franja sin partidos: 21:00 - 21:30</li>
          </ul>
        </Card>
        
        <Card className={styles.controlCard}>
          <h3>🚀 Ejecutar Algoritmo</h3>
          <p>Scheduler optimizado: maximización de pistas, separación lógica jugador/árbitro, equipos administradores, <strong>disponibilidad horaria</strong>, <strong>franja 21:00-21:30</strong> y sin bloqueos artificiales.</p>
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