/**
 * Genera horarios para los partidos de la fase de playoffs
 * ✅ NUEVA REGLA: Siempre intentar completar todas las pistas disponibles
 * Si no hay árbitros suficientes, algunos partidos se quedan sin árbitro (se asigna manualmente)
 */

export async function schedulePlayoffMatches(
  playoffMatches,
  originalMatches,
  allTeams,
  config,
  onLog
) {
  console.log('📅 schedulePlayoffMatches - Inicio', {
    playoffMatches: playoffMatches?.length,
    originalMatches: originalMatches?.length,
    allTeams: allTeams?.length
  });

  const num_courts = config?.num_courts || 3;
  const match_duration_minutes = config?.match_duration_minutes || 45;
  const buffer_minutes = config?.buffer_minutes || 10;
  const duration = (match_duration_minutes + buffer_minutes) * 60000;

  // Encontrar la hora del último partido finalizado de la fase inicial
  const finishedMatches = originalMatches.filter(m => 
    (m.status === 'finished' || m.status === 'completed') && m.match_date
  );
  
  if (finishedMatches.length === 0) {
    throw new Error('No hay partidos finalizados en la fase inicial para calcular el inicio');
  }

  // Calcular hora de inicio (después del último partido + buffer)
  let maxEndTime = 0;
  finishedMatches.forEach(m => {
    const startTime = new Date(m.match_date).getTime();
    const endTime = startTime + duration;
    if (endTime > maxEndTime) maxEndTime = endTime;
  });

  let currentTime = maxEndTime + (buffer_minutes * 60000);
  onLog(`📅 Inicio playoffs: ${new Date(currentTime).toLocaleString('es-ES')}`);

  // Filtrar partidos pendientes de programar
  const pendingMatches = playoffMatches.filter(m => 
    m.phase === 'playoff_group' && 
    !m.match_date &&
    m.status === 'scheduled'
  );

  onLog(`🔄 Programando ${pendingMatches.length} partidos...`);

  if (pendingMatches.length === 0) return [];

  // ========================================================================
  // IDENTIFICAR EQUIPOS PARTICIPANTES EN ESTA FASE
  // ========================================================================
  const playoffTeamIds = new Set();
  pendingMatches.forEach(m => {
    playoffTeamIds.add(m.home_team_id);
    playoffTeamIds.add(m.away_team_id);
  });
  
  const totalPlayoffTeams = playoffTeamIds.size; // Deberían ser 8
  console.log(`👥 Equipos participantes: ${totalPlayoffTeams}`);

  // Estado de equipos
  const teamBusyUntil = {};
  const teamLastPlayed = {};
  const teamRefereeCount = {};

  // Inicializar equipos de playoffs
  allTeams.forEach(team => {
    if (playoffTeamIds.has(team.id)) {
      teamBusyUntil[team.id] = 0;
      teamLastPlayed[team.id] = 0;
      teamRefereeCount[team.id] = 0;
    }
  });

  // Equipos admin
  const adminTeamIds = allTeams.filter(t => t.is_admin_team).map(t => t.id);

  // Ordenar por ronda
  const sortedMatches = [...pendingMatches].sort((a, b) => a.round - b.round);
  const scheduled = [];

  // ========================================================================
  // BUCLE PRINCIPAL - PRIORIZANDO LLENAR TODAS LAS PISTAS
  // ========================================================================
  while (sortedMatches.length > 0) {
    const slotMatches = [];
    const slotPlayingTeams = new Set();
    const slotReferees = new Set();

    // Filtrar partidos disponibles para este slot
    const availableMatches = sortedMatches.filter(match => {
      const homeFree = (teamBusyUntil[match.home_team_id] || 0) <= currentTime;
      const awayFree = (teamBusyUntil[match.away_team_id] || 0) <= currentTime;
      return homeFree && awayFree &&
        !slotPlayingTeams.has(match.home_team_id) &&
        !slotPlayingTeams.has(match.away_team_id);
    });

    // ✅ NUEVA REGLA: Usar directamente num_courts como límite máximo
    // No limitar por disponibilidad de árbitros
    const maxPistasToUse = Math.min(num_courts, availableMatches.length);
    
    // Si no hay partidos disponibles, avanzamos el tiempo
    if (maxPistasToUse === 0) {
      const nextFree = Object.values(teamBusyUntil).filter(t => t > currentTime);
      if (nextFree.length > 0) {
        currentTime = Math.min(...nextFree);
      } else {
        currentTime += duration;
      }
      continue;
    }

    console.log(`⏱️ Slot ${new Date(currentTime).toLocaleTimeString('es-ES')} - Intentando llenar ${maxPistasToUse} pistas de ${num_courts} disponibles`);

    // Asignar a pistas (intentando llenar todas las disponibles)
    for (let court = 1; court <= maxPistasToUse; court++) {
      let selectedMatch = null;

      for (const match of availableMatches) {
        if (slotPlayingTeams.has(match.home_team_id) || 
            slotPlayingTeams.has(match.away_team_id)) continue;

        selectedMatch = match;
        break;
      }

      if (!selectedMatch) break;

      slotMatches.push({ ...selectedMatch, court });
      slotPlayingTeams.add(selectedMatch.home_team_id);
      slotPlayingTeams.add(selectedMatch.away_team_id);

      const idx = availableMatches.indexOf(selectedMatch);
      if (idx !== -1) availableMatches.splice(idx, 1);
    }

    if (slotMatches.length === 0) {
      const nextFree = Object.values(teamBusyUntil).filter(t => t > currentTime);
      if (nextFree.length > 0) {
        currentTime = Math.min(...nextFree);
      } else {
        currentTime += duration;
      }
      continue;
    }

    // Remover de pendientes
    slotMatches.forEach(sm => {
      const idx = sortedMatches.findIndex(m => m.id === sm.id);
      if (idx !== -1) sortedMatches.splice(idx, 1);
    });

    const endTime = currentTime + duration;

    // Asignar árbitros y guardar
    for (const match of slotMatches) {
      // Buscar árbitros disponibles (SOLO equipos del playoff)
      const possibleRefs = allTeams.filter(team => 
        playoffTeamIds.has(team.id) && 
        team.id !== match.home_team_id &&
        team.id !== match.away_team_id &&
        !slotPlayingTeams.has(team.id) &&
        !slotReferees.has(team.id) &&
        (teamBusyUntil[team.id] || 0) <= currentTime
      );

      // Ordenar por menos arbitrajes previos
      possibleRefs.sort((a, b) => {
        const refDiff = (teamRefereeCount[a.id] || 0) - (teamRefereeCount[b.id] || 0);
        if (refDiff !== 0) return refDiff;
        return 0;
      });

      // ✅ NUEVA REGLA: Si no hay árbitros disponibles, dejar como null
      const referee = possibleRefs.length > 0 ? possibleRefs[0] : null;

      if (referee) {
        slotReferees.add(referee.id);
        teamRefereeCount[referee.id] = (teamRefereeCount[referee.id] || 0) + 1;
      }

      scheduled.push({
        id: match.id,
        match_date: new Date(currentTime).toISOString(),
        court_number: match.court,
        referee_team_id: referee ? referee.id : null
      });

      // Actualizar estado
      teamBusyUntil[match.home_team_id] = endTime;
      teamBusyUntil[match.away_team_id] = endTime;
      teamLastPlayed[match.home_team_id] = endTime;
      teamLastPlayed[match.away_team_id] = endTime;

      const homeName = allTeams.find(t => t.id === match.home_team_id)?.team_name?.slice(0, 10) || '???';
      const awayName = allTeams.find(t => t.id === match.away_team_id)?.team_name?.slice(0, 10) || '???';
      const refName = referee?.team_name?.slice(0, 10) || '⚠️ SIN ÁRBITRO';
      
      onLog(`🏟️ P${match.court} | ${new Date(currentTime).toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'})} | ${homeName} vs ${awayName} | Árbitro: ${refName}`);
    }

    currentTime += duration;
  }

  // ✅ Log de partidos sin árbitro
  const matchesWithoutReferee = scheduled.filter(m => !m.referee_team_id);
  if (matchesWithoutReferee.length > 0) {
    onLog(`⚠️ ${matchesWithoutReferee.length} partidos programados SIN árbitro (asignar manualmente)`);
  }

  onLog(`✅ ${scheduled.length} partidos programados`);
  return scheduled;
}