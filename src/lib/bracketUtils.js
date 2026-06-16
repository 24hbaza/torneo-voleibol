// src/lib/bracketUtils.js

export const isPowerOfTwo = (n) => n > 0 && (n & (n - 1)) === 0;

/**
 * ✅ NUEVA FUNCIÓN: Selecciona los mejores terceros de todos los grupos
 * Criterios:
 * 1. Más puntos (partidos ganados)
 * 2. Mejor diferencia de sets
 * 3. Mejor diferencia de puntos
 */
const selectBestThirdPlaces = (allGroupsStandings, numNeeded) => {
  console.log('🔍 Seleccionando mejores terceros...');
  
  // Recopilar todos los terceros
  const thirdPlaces = [];
  
  Object.entries(allGroupsStandings).forEach(([groupId, standings]) => {
    if (standings.length >= 3) {
      const third = standings[2]; // Índice 2 = tercer lugar
      thirdPlaces.push({
        team_id: third.team_id,
        team_name: third.team_name,
        original_group_id: groupId,
        seed: 3,
        pts: third.pts,
        w: third.w || 0,
        sf: third.sf || 0,
        sc: third.sc || 0,
        pf: third.pf || 0,
        pa: third.pa || 0,
        sets_diff: (third.sf || 0) - (third.sc || 0),
        points_diff: (third.pf || 0) - (third.pa || 0)
      });
    }
  });
  
  console.log('📊 Terceros encontrados:', thirdPlaces.length);
  
  // Ordenar por criterios
  thirdPlaces.sort((a, b) => {
    // Criterio 1: Puntos (partidos ganados)
    if (b.pts !== a.pts) {
      return b.pts - a.pts;
    }
    
    // Criterio 2: Diferencia de sets
    if (b.sets_diff !== a.sets_diff) {
      return b.sets_diff - a.sets_diff;
    }
    
    // Criterio 3: Diferencia de puntos
    return b.points_diff - a.points_diff;
  });
  
  // Tomar los N mejores
  const bestThirds = thirdPlaces.slice(0, numNeeded);
  
  console.log('✅ Mejores terceros seleccionados:');
  bestThirds.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.team_name} (${t.pts} pts, ${t.sets_diff} sets diff, ${t.points_diff} pts diff)`);
  });
  
  return bestThirds;
};

export const generateBracketMatches = (standings, numGroups, teamsAdvancing, groupZId, groupWId) => {
  console.log('🎯 generateBracketMatches:', { standingsCount: standings?.length, numGroups, teamsAdvancing });
  console.log('📋 Group IDs:', { groupZId, groupWId });
  
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
  
  // Ordenar cada grupo por clasificación
  Object.keys(groupsById).forEach(groupId => {
    groupsById[groupId].sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.w !== a.w) return b.w - a.w;
      const diffA = (a.sf || 0) - (a.sc || 0);
      const diffB = (b.sf || 0) - (b.sc || 0);
      if (diffB !== diffA) return diffB - diffA;
      return (b.pf || 0) - (a.pf || 0);
    });
  });
  
  // ============================================================================
  // 2. SELECCIONAR CLASIFICADOS SEGÚN NÚMERO DE GRUPOS
  // ============================================================================
  let qualified = [];
  
  // ✅ CASO 1: 2 GRUPOS - Top 4 de cada grupo
  if (numGroups === 2) {
    console.log('✅ Modo 2 grupos: Top 4 de cada grupo');
    
    Object.entries(groupsById).forEach(([groupId, groupTeams]) => {
      // Tomar los 4 primeros
      const top4 = groupTeams.slice(0, 4);
      
      top4.forEach((team, idx) => {
        qualified.push({
          team_id: team.team_id,
          team_name: team.team_name,
          original_group_id: groupId,
          seed: idx + 1,
          pts: team.pts,
          w: team.w || 0,
          sf: team.sf || 0,
          sc: team.sc || 0,
          pf: team.pf || 0,
          pa: team.pa || 0
        });
      });
      
      console.log(`  ✅ Grupo ${groupId}: ${top4.length} clasificados`);
    });
  }
  
  // ✅ CASO 2: 3 GRUPOS - Top 2 + 2 mejores terceros
  else if (numGroups === 3) {
    console.log('✅ Modo 3 grupos: Top 2 + 2 mejores terceros');
    
    // Paso 1: Tomar los 2 primeros de cada grupo
    Object.entries(groupsById).forEach(([groupId, groupTeams]) => {
      const top2 = groupTeams.slice(0, 2);
      
      top2.forEach((team, idx) => {
        qualified.push({
          team_id: team.team_id,
          team_name: team.team_name,
          original_group_id: groupId,
          seed: idx + 1,
          pts: team.pts,
          w: team.w || 0,
          sf: team.sf || 0,
          sc: team.sc || 0,
          pf: team.pf || 0,
          pa: team.pa || 0,
          qualified_as: 'top2'
        });
      });
      
      console.log(`  ✅ Grupo ${groupId}: Top 2 clasificados`);
    });
    
    // Paso 2: Seleccionar los 2 mejores terceros
    const bestThirds = selectBestThirdPlaces(groupsById, 2);
    
    bestThirds.forEach(third => {
      qualified.push({
        ...third,
        seed: 3,
        qualified_as: 'best_third'
      });
    });
  }
  
  // ✅ CASO POR DEFECTO: 4 GRUPOS - Top 2 de cada grupo (lógica original)
  else if (numGroups === 4) {
    console.log('✅ Modo 4 grupos: Top 2 de cada grupo');
    
    Object.entries(groupsById).forEach(([groupId, groupTeams]) => {
      const top2 = groupTeams.slice(0, 2);
      
      top2.forEach((team, idx) => {
        qualified.push({
          team_id: team.team_id,
          team_name: team.team_name,
          original_group_id: groupId,
          seed: idx + 1,
          pts: team.pts,
          w: team.w || 0,
          sf: team.sf || 0,
          sc: team.sc || 0,
          pf: team.pf || 0,
          pa: team.pa || 0
        });
      });
      
      console.log(`  ✅ Grupo ${groupId}: ${top2.length} clasificados`);
    });
  }
  
  // ✅ CASO GENÉRICO: Usar teamsAdvancing
  else {
    console.log('⚠️ Modo genérico: usando teamsAdvancing =', teamsAdvancing);
    
    Object.entries(groupsById).forEach(([groupId, groupTeams]) => {
      const topN = groupTeams.slice(0, teamsAdvancing);
      
      topN.forEach((team, idx) => {
        qualified.push({
          team_id: team.team_id,
          team_name: team.team_name,
          original_group_id: groupId,
          seed: idx + 1,
          pts: team.pts,
          w: team.w || 0,
          sf: team.sf || 0,
          sc: team.sc || 0,
          pf: team.pf || 0,
          pa: team.pa || 0
        });
      });
      
      console.log(`  ✅ Grupo ${groupId}: ${topN.length} clasificados`);
    });
  }
  
  console.log('✅ Total clasificados:', qualified.length);
  
  // Validar que sea potencia de 2
  if (!isPowerOfTwo(qualified.length)) {
    throw new Error(`El total de clasificados (${qualified.length}) no es potencia de 2.`);
  }
  
  // ============================================================================
  // 3. CREAR GRUPOS Z Y W CON DISTRIBUCIÓN EQUILIBRADA
  // ============================================================================
  
  const groupIds = Object.keys(groupsById).sort();
  
  // ✅ DISTRIBUCIÓN PARA 2 GRUPOS (8 equipos)
  if (numGroups === 2) {
    console.log('📦 Distribuyendo 8 equipos de 2 grupos en Z y W...');
    
    const [groupA, groupB] = groupIds;
    
    // Grupo Z: 1ºA, 2ºB, 3ºA, 4ºB
    const groupZ = [
      qualified.find(q => q.original_group_id === groupA && q.seed === 1),
      qualified.find(q => q.original_group_id === groupB && q.seed === 2),
      qualified.find(q => q.original_group_id === groupA && q.seed === 3),
      qualified.find(q => q.original_group_id === groupB && q.seed === 4)
    ].filter(Boolean);
    
    // Grupo W: 1ºB, 2ºA, 3ºB, 4ºA
    const groupW = [
      qualified.find(q => q.original_group_id === groupB && q.seed === 1),
      qualified.find(q => q.original_group_id === groupA && q.seed === 2),
      qualified.find(q => q.original_group_id === groupB && q.seed === 3),
      qualified.find(q => q.original_group_id === groupA && q.seed === 4)
    ].filter(Boolean);
    
    if (groupZ.length !== 4 || groupW.length !== 4) {
      throw new Error(`Distribución incorrecta: Z=${groupZ.length}, W=${groupW.length}`);
    }
    
    console.log('📦 Grupo Z:', groupZ.map(t => t.team_name).join(', '));
    console.log('📦 Grupo W:', groupW.map(t => t.team_name).join(', '));
    
    return generatePlayoffMatches(groupZ, groupW, groupZId, groupWId);
  }
  
  // ✅ DISTRIBUCIÓN PARA 3 GRUPOS (8 equipos)
  else if (numGroups === 3) {
    console.log('📦 Distribuyendo 8 equipos de 3 grupos en Z y W...');
    
    const [groupA, groupB, groupC] = groupIds;
    
    // Separar equipos por tipo de clasificación
    const top2FromA = qualified.filter(q => q.original_group_id === groupA && q.qualified_as === 'top2');
    const top2FromB = qualified.filter(q => q.original_group_id === groupB && q.qualified_as === 'top2');
    const top2FromC = qualified.filter(q => q.original_group_id === groupC && q.qualified_as === 'top2');
    const bestThirds = qualified.filter(q => q.qualified_as === 'best_third');
    
    console.log('  Top 2 de A:', top2FromA.length);
    console.log('  Top 2 de B:', top2FromB.length);
    console.log('  Top 2 de C:', top2FromC.length);
    console.log('  Mejores terceros:', bestThirds.length);
    
    // Distribución equilibrada:
    // Grupo Z: 1ºA, 2ºB, 1ºC, 3º(mejor)
    // Grupo W: 1ºB, 2ºC, 2ºA, 3º(segundo mejor)
    
    // Ordenar mejores terceros para asignación
    const sortedThirds = [...bestThirds].sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.sets_diff !== a.sets_diff) return b.sets_diff - a.sets_diff;
      return b.points_diff - a.points_diff;
    });
    
    const groupZ = [
      top2FromA.find(t => t.seed === 1),
      top2FromB.find(t => t.seed === 2),
      top2FromC.find(t => t.seed === 1),
      sortedThirds[0]
    ].filter(Boolean);
    
    const groupW = [
      top2FromB.find(t => t.seed === 1),
      top2FromC.find(t => t.seed === 2),
      top2FromA.find(t => t.seed === 2),
      sortedThirds[1]
    ].filter(Boolean);
    
    if (groupZ.length !== 4 || groupW.length !== 4) {
      throw new Error(`Distribución incorrecta: Z=${groupZ.length}, W=${groupW.length}`);
    }
    
    console.log('📦 Grupo Z:', groupZ.map(t => `${t.team_name} (${t.qualified_as})`).join(', '));
    console.log('📦 Grupo W:', groupW.map(t => `${t.team_name} (${t.qualified_as})`).join(', '));
    
    return generatePlayoffMatches(groupZ, groupW, groupZId, groupWId);
  }
  
  // ✅ DISTRIBUCIÓN PARA 4 GRUPOS (8 equipos) - Lógica original
  else if (numGroups === 4) {
    console.log('📦 Distribuyendo 8 equipos de 4 grupos en Z y W...');
    
    const [groupA, groupB, groupC, groupD] = groupIds;
    
    const getTeamByGroupAndSeed = (groupId, seed) => {
      return qualified.find(q => q.original_group_id === groupId && q.seed === seed);
    };
    
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
    
    return generatePlayoffMatches(groupZ, groupW, groupZId, groupWId);
  }
  
  // ✅ CASO GENÉRICO
  else {
    console.log('⚠️ Distribución genérica para', numGroups, 'grupos');
    
    // Distribuir equipos alternando entre Z y W
    const groupZ = [];
    const groupW = [];
    
    qualified.forEach((team, idx) => {
      if (idx % 2 === 0) {
        groupZ.push(team);
      } else {
        groupW.push(team);
      }
    });
    
    console.log('📦 Grupo Z:', groupZ.map(t => t.team_name).join(', '));
    console.log('📦 Grupo W:', groupW.map(t => t.team_name).join(', '));
    
    return generatePlayoffMatches(groupZ, groupW, groupZId, groupWId);
  }
};

/**
 * ✅ FUNCIÓN AUXILIAR: Genera los partidos de playoffs para grupos Z y W
 */
const generatePlayoffMatches = (groupZ, groupW, groupZId, groupWId) => {
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
  
  // Partidos Grupo Z
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
  
  // Partidos Grupo W
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
  
  // Semifinales
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
  
  console.log(`🎉 Total partidos generados: ${matches.length}`);
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