export const isPowerOfTwo = (n) => n > 0 && (n & (n - 1)) === 0;

export const generateBracketMatches = (standings, numGroups, teamsAdvancing, groupZId, groupWId) => {
  console.log('🎯 generateBracketMatches:', { standingsCount: standings?.length, numGroups, teamsAdvancing });
  console.log('📋 Group IDs:', { groupZId, groupWId });
  
  const totalAdvancing = numGroups * teamsAdvancing;
  
  if (!isPowerOfTwo(totalAdvancing)) {
    throw new Error(`El total de clasificados (${totalAdvancing}) no es potencia de 2.`);
  }

  // ============================================================================
  // 1. AGRUPAR CLASIFICADOS POR GRUPO ORIGINAL
  // ============================================================================
  const groupsById = {};
  standings.forEach(s => {
    const gid = String(s.group_id)?.trim();
    if (!gid) return;
    if (!groupsById[gid]) groupsById[gid] = [];
    groupsById[gid].push(s);
  });
  
  console.log('📊 Grupos encontrados:', Object.keys(groupsById).length);
  
  const qualified = [];
  
  Object.entries(groupsById).forEach(([groupId, groupTeams]) => {
    groupTeams.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.w !== a.w) return b.w - a.w;
      const diffA = (a.sf || 0) - (a.sc || 0);
      const diffB = (b.sf || 0) - (b.sc || 0);
      if (diffB !== diffA) return diffB - diffA;
      return (b.pf || 0) - (a.pf || 0);
    });
    
    for (let i = 0; i < teamsAdvancing; i++) {
      if (groupTeams[i]) {
        qualified.push({ 
          team_id: groupTeams[i].team_id, 
          team_name: groupTeams[i].team_name,
          original_group_id: groupId,
          seed: i + 1,
          pts: groupTeams[i].pts
        });
      }
    }
  });

  console.log('✅ Clasificados:', qualified.length);
  
  if (qualified.length !== totalAdvancing) {
    throw new Error(`Faltan equipos. Esperados: ${totalAdvancing}, Encontrados: ${qualified.length}`);
  }

  // ============================================================================
  // 2. CREAR GRUPOS Z Y W CON DISTRIBUCIÓN ESPECÍFICA
  // ============================================================================
  
  const getTeamByGroupAndSeed = (groupId, seed) => {
    return qualified.find(q => q.original_group_id === groupId && q.seed === seed);
  };
  
  const groupIds = Object.keys(groupsById).sort();
  
  if (groupIds.length !== 4) {
    throw new Error(`Se necesitan exactamente 4 grupos. Encontrados: ${groupIds.length}`);
  }
  
  const [groupA, groupB, groupC, groupD] = groupIds;
  
  const groupZ = [
    getTeamByGroupAndSeed(groupA, 1),
    getTeamByGroupAndSeed(groupB, 2),
    getTeamByGroupAndSeed(groupC, 2),
    getTeamByGroupAndSeed(groupD, 1)
  ].filter(Boolean);
  
  const groupW = [
    getTeamByGroupAndSeed(groupA, 2),
    getTeamByGroupAndSeed(groupB, 1),
    getTeamByGroupAndSeed(groupC, 1),
    getTeamByGroupAndSeed(groupD, 2)
  ].filter(Boolean);
  
  if (groupZ.length !== 4 || groupW.length !== 4) {
    throw new Error(`Distribución incorrecta: Z=${groupZ.length}, W=${groupW.length}`);
  }

  console.log('📦 Grupo Z:', groupZ.map(t => t.team_name).join(', '));
  console.log('📦 Grupo W:', groupW.map(t => t.team_name).join(', '));

  // ============================================================================
  // 3. GENERAR PARTIDOS CON UUIDS REALES
  // ============================================================================
  const matches = [];
  
  const generateRoundRobin = (teams) => {
    const roundMatches = [];
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        roundMatches.push({ home: teams[i], away: teams[j] });
      }
    }
    return roundMatches;
  };
  
  // Partidos Grupo Z (USANDO groupZId UUID)
  const groupZMatches = generateRoundRobin(groupZ);
  groupZMatches.forEach((m, idx) => {
    matches.push({
      id: crypto.randomUUID(),
      group_id: groupZId,
      home_team_id: m.home.team_id,
      away_team_id: m.away.team_id,
      round: Math.floor(idx / 2) + 1,
      phase: 'playoff_group',
      status: 'scheduled',
      match_date: null,
      court_number: null,
      referee_team_id: null,
      home_score: null,
      away_score: null,
      winner_team_id: null,
      verification_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
      sets_details: [],
      points_to_win: 25,
      sets_to_win: 2
    });
  });
  
  // Partidos Grupo W (USANDO groupWId UUID)
  const groupWMatches = generateRoundRobin(groupW);
  groupWMatches.forEach((m, idx) => {
    matches.push({
      id: crypto.randomUUID(),
      group_id: groupWId,
      home_team_id: m.home.team_id,
      away_team_id: m.away.team_id,
      round: Math.floor(idx / 2) + 1,
      phase: 'playoff_group',
      status: 'scheduled',
      match_date: null,
      court_number: null,
      referee_team_id: null,
      home_score: null,
      away_score: null,
      winner_team_id: null,
      verification_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
      sets_details: [],
      points_to_win: 25,
      sets_to_win: 2
    });
  });
  
  // Semifinales (group_id = null)
  matches.push({
    id: crypto.randomUUID(),
    group_id: null,
    home_team_id: null,
    away_team_id: null,
    round: 4,
    phase: 'playoff_final',
    status: 'pending',
    match_date: null,
    court_number: null,
    referee_team_id: null,
    home_score: null,
    away_score: null,
    winner_team_id: null,
    verification_code: null,
    sets_details: [],
    points_to_win: 25,
    sets_to_win: 2
  });
  
  matches.push({
    id: crypto.randomUUID(),
    group_id: null,
    home_team_id: null,
    away_team_id: null,
    round: 4,
    phase: 'playoff_final',
    status: 'pending',
    match_date: null,
    court_number: null,
    referee_team_id: null,
    home_score: null,
    away_score: null,
    winner_team_id: null,
    verification_code: null,
    sets_details: [],
    points_to_win: 25,
    sets_to_win: 2
  });
  
  // Final
  matches.push({
    id: crypto.randomUUID(),
    group_id: null,
    home_team_id: null,
    away_team_id: null,
    round: 5,
    phase: 'playoff_final',
    status: 'pending',
    match_date: null,
    court_number: null,
    referee_team_id: null,
    home_score: null,
    away_score: null,
    winner_team_id: null,
    verification_code: null,
    sets_details: [],
    points_to_win: 25,
    sets_to_win: 2
  });
  
  // 3er Puesto
  matches.push({
    id: crypto.randomUUID(),
    group_id: null,
    home_team_id: null,
    away_team_id: null,
    round: 5,
    phase: 'playoff_final',
    status: 'pending',
    match_date: null,
    court_number: null,
    referee_team_id: null,
    home_score: null,
    away_score: null,
    winner_team_id: null,
    verification_code: null,
    sets_details: [],
    points_to_win: 25,
    sets_to_win: 2
  });
  
  console.log(`🎉 Total partidos: ${matches.length}`);
  return matches;
};

export const getMatchCategory = (match) => {
  if (match.phase === 'playoff_group') {
    return 'group_stage';
  }
  if (match.round === 4 && match.phase === 'playoff_final') return 'semifinal';
  if (match.round === 5 && match.phase === 'playoff_final') {
    return match.home_team_id === null ? 'final' : 'third_place'; 
  }
  return 'unknown';
};

export const updateSemifinalsWithQualifiers = (groupZStandings, groupWStandings, existingMatches, groupZId, groupWId) => {
  if (!groupZStandings || groupZStandings.length < 2 || !groupWStandings || groupWStandings.length < 2) {
    return existingMatches;
  }
  
  const semis = existingMatches.filter(m => 
    m.round === 4 && 
    m.phase === 'playoff_final' && 
    m.status === 'pending'
  );
  
  if (semis.length < 2) return existingMatches;
  
  return existingMatches.map(match => {
    if (match.id === semis[0].id) {
      return {
        ...match,
        home_team_id: groupZStandings[0].id,
        away_team_id: groupWStandings[1].id,
        status: 'scheduled'
      };
    }
    if (match.id === semis[1].id) {
      return {
        ...match,
        home_team_id: groupZStandings[1].id,
        away_team_id: groupWStandings[0].id,
        status: 'scheduled'
      };
    }
    return match;
  });
};

export const updateFinalsWithSemifinalResults = (semifinalResults, existingMatches) => {
  const sf1 = semifinalResults.find(m => m.round === 4 && m.phase === 'playoff_final' && m.winner_team_id);
  const sf2 = semifinalResults.find(m => 
    m.round === 4 && 
    m.phase === 'playoff_final' && 
    m.winner_team_id && 
    m.id !== sf1?.id
  );
  
  if (!sf1?.winner_team_id || !sf2?.winner_team_id) return existingMatches;
  
  const sf1Winner = sf1.winner_team_id;
  const sf1Loser = sf1.home_team_id === sf1Winner ? sf1.away_team_id : sf1.home_team_id;
  const sf2Winner = sf2.winner_team_id;
  const sf2Loser = sf2.home_team_id === sf2Winner ? sf2.away_team_id : sf2.home_team_id;
  
  const finals = existingMatches.filter(m => 
    m.round === 5 && 
    m.phase === 'playoff_final' && 
    m.status === 'pending'
  );
  
  if (finals.length < 2) return existingMatches;
  
  return existingMatches.map(match => {
    if (match.id === finals[0].id) {
      return { ...match, home_team_id: sf1Winner, away_team_id: sf2Winner, status: 'scheduled' };
    }
    if (match.id === finals[1].id) {
      return { ...match, home_team_id: sf1Loser, away_team_id: sf2Loser, status: 'scheduled' };
    }
    return match;
  });
};