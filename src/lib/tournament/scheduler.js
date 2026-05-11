import { supabase } from '../supabaseClient';

/**
 * Programa los partidos de la fase de playoffs (Grupos Z y W)
 * Usando el mismo algoritmo que la fase inicial pero solo con los 8 equipos
 */
export async function schedulePlayoffMatches(config, onLog) {
  const num_courts = config.num_courts;
  const match_duration_minutes = config.match_duration_minutes || 45;
  const buffer_minutes = config.buffer_minutes || 0;
  const duration = (match_duration_minutes + buffer_minutes) * 60000;
  
  // Obtener partidos de playoffs sin programar
  const { data: playoffMatches, error } = await supabase
    .from('matches')
    .select('*')
    .in('phase', ['playoff_group'])
    .is('match_date', null);
  
  if (error) throw error;
  if (!playoffMatches || playoffMatches.length === 0) {
    onLog('ℹ️ No hay partidos de playoffs por programar');
    return;
  }
  
  onLog(`📅 Programando ${playoffMatches.length} partidos de playoffs...`);
  
  // Obtener todos los equipos de playoffs
  const teamIds = new Set();
  playoffMatches.forEach(m => {
    teamIds.add(m.home_team_id);
    teamIds.add(m.away_team_id);
  });
  
  const { data: teams } = await supabase
    .from('profiles')
    .select('id, team_name, is_admin_team')
    .in('id', Array.from(teamIds));
  
  // Estado de equipos
  const teamBusyUntil = {};
  const teamLastPlayed = {};
  const teamRefereeCount = {};
  
  teams.forEach(team => {
    teamBusyUntil[team.id] = 0;
    teamLastPlayed[team.id] = 0;
    teamRefereeCount[team.id] = 0;
  });
  
  // Identificar equipos admin
  const adminTeamIds = teams.filter(t => t.is_admin_team).map(t => t.id);
  
  // Ordenar partidos por ronda
  const sortedMatches = [...playoffMatches].sort((a, b) => a.round - b.round);
  
  let currentTime = new Date(config.start_datetime).getTime();
  // Avanzar hasta después de la fase de grupos inicial
  currentTime += (7 * 24 * 60 * 60 * 1000); // 7 días después
  
  const scheduled = [];
  
  while (sortedMatches.length > 0) {
    const slotMatches = [];
    const slotPlayingTeams = new Set();
    const slotReferees = new Set();
    let slotAdminBusy = false;
    
    // Filtrar partidos disponibles
    const availableMatches = sortedMatches.filter(match => {
      const homeFree = (teamBusyUntil[match.home_team_id] || 0) <= currentTime;
      const awayFree = (teamBusyUntil[match.away_team_id] || 0) <= currentTime;
      
      return (
        homeFree &&
        awayFree &&
        !slotPlayingTeams.has(match.home_team_id) &&
        !slotPlayingTeams.has(match.away_team_id)
      );
    });
    
    // Ordenar por prioridad (menos partidos jugados primero)
    availableMatches.sort((a, b) => {
      const aWait = currentTime - Math.max(
        teamLastPlayed[a.home_team_id] || 0,
        teamLastPlayed[a.away_team_id] || 0
      );
      const bWait = currentTime - Math.max(
        teamLastPlayed[b.home_team_id] || 0,
        teamLastPlayed[b.away_team_id] || 0
      );
      
      if (bWait !== aWait) return bWait - aWait;
      return 0;
    });
    
    // Asignar a pistas
    for (let court = 1; court <= num_courts; court++) {
      let selectedMatch = null;
      
      for (const match of availableMatches) {
        if (slotPlayingTeams.has(match.home_team_id) || 
            slotPlayingTeams.has(match.away_team_id)) {
          continue;
        }
        
        const matchHasAdmin = 
          adminTeamIds.includes(match.home_team_id) || 
          adminTeamIds.includes(match.away_team_id);
        
        if (matchHasAdmin && slotAdminBusy) {
          continue;
        }
        
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
    
    // Eliminar pendientes programados
    slotMatches.forEach(sm => {
      const idx = sortedMatches.findIndex(m => 
        m.id === sm.id
      );
      if (idx !== -1) sortedMatches.splice(idx, 1);
    });
    
    const endTime = currentTime + duration;
    
    // Asignar árbitros y guardar
    for (const match of slotMatches) {
      const possibleRefs = teams.filter(team => 
        team.id !== match.home_team_id &&
        team.id !== match.away_team_id &&
        !slotPlayingTeams.has(team.id) &&
        !slotReferees.has(team.id) &&
        (teamBusyUntil[team.id] || 0) <= currentTime
      );
      
      // Priorizar equipos admin para arbitrar
      possibleRefs.sort((a, b) => {
        const aIsAdmin = adminTeamIds.includes(a.id) ? 1 : 0;
        const bIsAdmin = adminTeamIds.includes(b.id) ? 1 : 0;
        if (bIsAdmin !== aIsAdmin) return bIsAdmin - aIsAdmin;
        return teamRefereeCount[a.id] - teamRefereeCount[b.id];
      });
      
      const referee = possibleRefs.length > 0 ? possibleRefs[0] : null;
      
      if (referee) {
        slotReferees.add(referee.id);
        teamRefereeCount[referee.id]++;
      }
      
      scheduled.push({
        id: match.id,
        match_date: new Date(currentTime).toISOString(),
        court_number: match.court,
        referee_team_id: referee?.id || null
      });
      
      teamBusyUntil[match.home_team_id] = endTime;
      teamBusyUntil[match.away_team_id] = endTime;
      teamLastPlayed[match.home_team_id] = endTime;
      teamLastPlayed[match.away_team_id] = endTime;
      
      onLog(`🏟️ P${match.court} | ${match.home_team_name?.slice(0, 8)} vs ${match.away_team_name?.slice(0, 8)}`);
    }
    
    currentTime += duration;
  }
  
  // Actualizar en BD
  for (const match of scheduled) {
    await supabase
      .from('matches')
      .update({
        match_date: match.match_date,
        court_number: match.court_number,
        referee_team_id: match.referee_team_id,
        status: 'scheduled'
      })
      .eq('id', match.id);
  }
  
  onLog(`✅ ${scheduled.length} partidos de playoffs programados`);
}