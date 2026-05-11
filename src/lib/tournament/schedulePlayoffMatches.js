/**
 * Genera horarios para los partidos de la fase de playoffs
 * Restricción: Los árbitros solo pueden ser equipos participantes en esta fase.
 * Prioridad: Asignar árbitro antes que llenar todas las pistas.
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
  // BUCLE PRINCIPAL - PRIORIZANDO ÁRBITROS
  // ========================================================================
  while (sortedMatches.length > 0) {
    const slotMatches = [];
    const slotPlayingTeams = new Set();
    const slotReferees = new Set();
    let slotAdminBusy = false;

    // Filtrar partidos disponibles para este slot
    const availableMatches = sortedMatches.filter(match => {
      const homeFree = (teamBusyUntil[match.home_team_id] || 0) <= currentTime;
      const awayFree = (teamBusyUntil[match.away_team_id] || 0) <= currentTime;
      return homeFree && awayFree &&
        !slotPlayingTeams.has(match.home_team_id) &&
        !slotPlayingTeams.has(match.away_team_id);
    });

    // ========================================================================
    // CÁLCULO DE PISTAS MÁXIMAS BASADO EN ÁRBITROS DISPONIBLES
    // ========================================================================
    // Total equipos libres en este momento
    const freeTeamsCount = allTeams.filter(t => 
      playoffTeamIds.has(t.id) && 
      !slotPlayingTeams.has(t.id) &&
      (teamBusyUntil[t.id] || 0) <= currentTime
    ).length;

    // Cada partido necesita 2 equipos jugando + 1 árbitro = 3 equipos
    // Pero los árbitros pueden ser compartidos si no juegan.
    // La fórmula segura es: 
    // Si tenemos N equipos libres, y cada partido consume 2 equipos,
    // los restantes (N - 2*partidos) deben ser >= partidos (para que haya 1 árbitro por partido).
    // N - 2P >= P  =>  N >= 3P  =>  P <= N/3
    
    const maxMatchesByReferees = Math.floor(freeTeamsCount / 3);
    const maxPistasToUse = Math.min(num_courts, maxMatchesByReferees, availableMatches.length);
    
    // Si no podemos asignar ni un árbitro, avanzamos el tiempo
    if (maxPistasToUse === 0) {
      const nextFree = Object.values(teamBusyUntil).filter(t => t > currentTime);
      if (nextFree.length > 0) {
        currentTime = Math.min(...nextFree);
      } else {
        currentTime += duration;
      }
      continue;
    }

    console.log(`⏱️ Slot ${new Date(currentTime).toLocaleTimeString('es-ES')} - Equipos libres: ${freeTeamsCount}, Pistas a usar: ${maxPistasToUse}`);

    // Asignar a pistas (respetando el límite calculado)
    for (let court = 1; court <= maxPistasToUse; court++) {
      let selectedMatch = null;

      for (const match of availableMatches) {
        if (slotPlayingTeams.has(match.home_team_id) || 
            slotPlayingTeams.has(match.away_team_id)) continue;

        const hasAdmin = adminTeamIds.includes(match.home_team_id) || 
                        adminTeamIds.includes(match.away_team_id);

        if (hasAdmin && slotAdminBusy) continue;

        selectedMatch = match;
        break;
      }

      if (!selectedMatch) break;

      slotMatches.push({ ...selectedMatch, court });
      slotPlayingTeams.add(selectedMatch.home_team_id);
      slotPlayingTeams.add(selectedMatch.away_team_id);

      if (adminTeamIds.includes(selectedMatch.home_team_id) ||
          adminTeamIds.includes(selectedMatch.away_team_id)) {
        slotAdminBusy = true;
      }

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
      const refName = referee?.team_name?.slice(0, 10) || 'SIN ÁRBITRO';
      
      onLog(`🏟️ P${match.court} | ${new Date(currentTime).toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'})} | ${homeName} vs ${awayName} | Árbitro: ${refName}`);
    }

    currentTime += duration;
  }

  onLog(`✅ ${scheduled.length} partidos programados`);
  return scheduled;
}