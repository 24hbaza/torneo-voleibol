// src/lib/tournament/knockoutGenerator.js

/**
 * Genera la Fase Intermedia (Grupos Z y W) y Fase Final
 * Basado en los 8 equipos clasificados de la fase de grupos inicial
 */

// ============================================================================
// GENERADOR DE PARTIDOS ROUND-ROBIN
// ============================================================================

function generateRoundRobinMatches(teams, isDouble = false) {
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
        roundMatches.push({ 
          home_team_id: home.id, 
          away_team_id: away.id,
          home_team_name: home.team_name,
          away_team_name: away.team_name
        });
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
        return { 
          home_team_id: match.away_team_id, 
          away_team_id: match.home_team_id,
          home_team_name: match.away_team_name,
          away_team_name: match.home_team_name
        };
      });
    });
    rounds = rounds.concat(returnRounds);
  }
  
  return rounds;
}

// ============================================================================
// FORMACIÓN DE GRUPOS EQUILIBRADOS (Z y W)
// ============================================================================

/**
 * Distribuye 8 equipos en 2 grupos (Z y W) de forma equilibrada
 * Evita que equipos del mismo grupo original se crucen
 * Evita que todos los primeros se queden en el mismo grupo
 */
function createBalancedGroups(qualifiedTeams) {
  // qualifiedTeams: Array de 8 equipos con estructura:
  // { id, team_name, original_group_id, position_in_group (1=primero, 2=segundo, etc.) }
  
  console.log('📊 Creando grupos equilibrados con 8 equipos...');
  
  // Separar por posiciones (1ros, 2dos, etc.)
  var firstPlaces = [];
  var secondPlaces = [];
  var otherPlaces = [];
  
  for (var i = 0; i < qualifiedTeams.length; i++) {
    var team = qualifiedTeams[i];
    if (team.position_in_group === 1) {
      firstPlaces.push(team);
    } else if (team.position_in_group === 2) {
      secondPlaces.push(team);
    } else {
      otherPlaces.push(team);
    }
  }
  
  // Mezclar dentro de cada categoría para aleatoriedad controlada
  firstPlaces = shuffleArray(firstPlaces);
  secondPlaces = shuffleArray(secondPlaces);
  otherPlaces = shuffleArray(otherPlaces);
  
  // Distribución equilibrada:
  // Grupo Z: 1º (de un grupo), 2º (de OTRO grupo), otros...
  // Grupo W: 1º (de otro grupo), 2º (de OTRO grupo), otros...
  
  var groupZ = [];
  var groupW = [];
  
  // Alternar primeros de grupo
  for (var f = 0; f < firstPlaces.length; f++) {
    if (f % 2 === 0) {
      groupZ.push(firstPlaces[f]);
    } else {
      groupW.push(firstPlaces[f]);
    }
  }
  
  // Alternar segundos de grupo (intentando no coincidir con el grupo original)
  for (var s = 0; s < secondPlaces.length; s++) {
    var team = secondPlaces[s];
    var groupZHasOriginal = groupZ.some(function(t) { return t.original_group_id === team.original_group_id; });
    var groupWHasOriginal = groupW.some(function(t) { return t.original_group_id === team.original_group_id; });
    
    if (!groupZHasOriginal && groupWHasOriginal) {
      groupZ.push(team);
    } else if (!groupWHasOriginal && groupZHasOriginal) {
      groupW.push(team);
    } else {
      // Si ambos tienen o ninguno tiene, alternar
      if (s % 2 === 0) {
        groupZ.push(team);
      } else {
        groupW.push(team);
      }
    }
  }
  
  // Rellenar con el resto
  for (var o = 0; o < otherPlaces.length; o++) {
    if (o % 2 === 0) {
      groupZ.push(otherPlaces[o]);
    } else {
      groupW.push(otherPlaces[o]);
    }
  }
  
  console.log('✅ Grupo Z:', groupZ.map(function(t) { return t.team_name; }).join(', '));
  console.log('✅ Grupo W:', groupW.map(function(t) { return t.team_name; }).join(', '));
  
  return {
    groupZ: groupZ,
    groupW: groupW
  };
}

function shuffleArray(array) {
  var arr = [...array];
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

// ============================================================================
// GENERADOR DE FASE INTERMEDIA Y FINAL
// ============================================================================

/**
 * Genera TODA la fase eliminatoria:
 * 1. Grupos Z y W (round-robin)
 * 2. Semifinales (con cruces específicos)
 * 3. Final y partido 3er/4to puesto
 */
export function generateKnockoutPhases(qualifiedTeams, config, existingMatches, onLog) {
  if (qualifiedTeams.length !== 8) {
    throw new Error('Se necesitan exactamente 8 equipos clasificados. Recibidos: ' + qualifiedTeams.length);
  }
  
  onLog('🔄 Generando fase eliminatoria completa...');
  
  // 1. Crear grupos equilibrados Z y W
  var balancedGroups = createBalancedGroups(qualifiedTeams);
  
  // 2. Generar partidos round-robin para Grupo Z
  var groupZMatches = [];
  var roundsZ = generateRoundRobinMatches(balancedGroups.groupZ, false);
  
  roundsZ.forEach(function(roundMatches, roundIndex) {
    roundMatches.forEach(function(match) {
      groupZMatches.push({
        group_id: 'group_z_knockout',
        group_name: 'Grupo Z (Fase Eliminatoria)',
        home_team_id: match.home_team_id,
        away_team_id: match.away_team_id,
        home_team_name: match.home_team_name,
        away_team_name: match.away_team_name,
        round: roundIndex + 1,
        phase: 'knockout_group',
        status: 'scheduled',
        match_date: null, // Se asignará en el scheduler
        court_number: null,
        referee_team_id: null,
        home_score: null,
        away_score: null,
        winner_team_id: null,
        verification_code: null,
        sets_details: [],
        points_to_win: config.points_to_win || 25,
        sets_to_win: config.sets_to_win || 2
      });
    });
  });
  
  onLog('✅ Generados ' + groupZMatches.length + ' partidos para Grupo Z');
  
  // 3. Generar partidos round-robin para Grupo W
  var groupWMatches = [];
  var roundsW = generateRoundRobinMatches(balancedGroups.groupW, false);
  
  roundsW.forEach(function(roundMatches, roundIndex) {
    roundMatches.forEach(function(match) {
      groupWMatches.push({
        group_id: 'group_w_knockout',
        group_name: 'Grupo W (Fase Eliminatoria)',
        home_team_id: match.home_team_id,
        away_team_id: match.away_team_id,
        home_team_name: match.home_team_name,
        away_team_name: match.away_team_name,
        round: roundIndex + 1,
        phase: 'knockout_group',
        status: 'scheduled',
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
      });
    });
  });
  
  onLog('✅ Generados ' + groupWMatches.length + ' partidos para Grupo W');
  
  // 4. Generar Semifinales y Final (placeholders - se activarán cuando terminen los grupos)
  var finalMatches = [
    // Semifinal 1: 1º Grupo Z vs 2º Grupo W
    {
      id: 'sf1_placeholder',
      group_id: null,
      group_name: 'Fase Final',
      home_team_id: 'winner_group_z_1st', // Placeholder
      away_team_id: 'winner_group_w_2nd', // Placeholder
      home_team_name: '1º Clasificado Grupo Z',
      away_team_name: '2º Clasificado Grupo W',
      round: 1,
      phase: 'knockout_final',
      match_type: 'semifinal_1',
      status: 'pending', // Pendiente hasta que terminen los grupos
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
    // Semifinal 2: 2º Grupo Z vs 1º Grupo W
    {
      id: 'sf2_placeholder',
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
    // Final: Ganador SF1 vs Ganador SF2
    {
      id: 'final_placeholder',
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
    // Partido 3er y 4to puesto: Perdedor SF1 vs Perdedor SF2
    {
      id: 'third_place_placeholder',
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
  
  onLog('✅ Generadas semifinales y final (pendientes de activación)');
  
  // Combinar todos los partidos
  var allMatches = [].concat(groupZMatches).concat(groupWMatches).concat(finalMatches);
  
  return {
    matches: allMatches,
    groups: [
      { id: 'group_z_knockout', name: 'Grupo Z (Fase Eliminatoria)', teams: balancedGroups.groupZ },
      { id: 'group_w_knockout', name: 'Grupo W (Fase Eliminatoria)', teams: balancedGroups.groupW }
    ]
  };
}

// ============================================================================
// ACTUALIZACIÓN DE SEMIFINALES CUANDO TERMINAN LOS GRUPOS
// ============================================================================

/**
 * Actualiza las semifinales con los equipos clasificados reales
 * Se llama cuando terminan los grupos Z y W
 */
export function updateFinalsWithQualifiers(groupZStandings, groupWStandings, existingMatches) {
  console.log('🔄 Actualizando semifinales con clasificados...');
  
  // Obtener 1º y 2º de cada grupo
  var groupZ1st = groupZStandings[0];
  var groupZ2nd = groupZStandings[1];
  var groupW1st = groupWStandings[0];
  var groupW2nd = groupWStandings[1];
  
  if (!groupZ1st || !groupZ2nd || !groupW1st || !groupW2nd) {
    throw new Error('No hay suficientes clasificados para actualizar semifinales');
  }
  
  // Buscar partidos de semifinales y actualizarlos
  var updatedMatches = existingMatches.map(function(match) {
    if (match.match_type === 'semifinal_1') {
      return {
        ...match,
        home_team_id: groupZ1st.id,
        away_team_id: groupW2nd.id,
        home_team_name: groupZ1st.name,
        away_team_name: groupW2nd.name,
        status: 'scheduled' // Cambiar de pending a scheduled
      };
    }
    if (match.match_type === 'semifinal_2') {
      return {
        ...match,
        home_team_id: groupZ2nd.id,
        away_team_id: groupW1st.id,
        home_team_name: groupZ2nd.name,
        away_team_name: groupW1st.name,
        status: 'scheduled'
      };
    }
    return match;
  });
  
  console.log('✅ Semifinales actualizadas con equipos reales');
  return updatedMatches;
}

// ============================================================================
// ACTUALIZACIÓN DE FINAL CUANDO TERMINAN SEMIFINALES
// ============================================================================

/**
 * Actualiza la final y el partido por el 3er puesto cuando terminan las semifinales
 */
export function updateFinalsWithSemifinalWinners(semifinal1Result, semifinal2Result, existingMatches) {
  console.log('🔄 Actualizando final y 3er puesto...');
  
  var sf1Winner = semifinal1Result.winner_team_id;
  var sf1Loser = semifinal1Result.home_team_id === sf1Winner ? 
                 semifinal1Result.away_team_id : semifinal1Result.home_team_id;
  var sf2Winner = semifinal2Result.winner_team_id;
  var sf2Loser = semifinal2Result.home_team_id === sf2Winner ? 
                 semifinal2Result.away_team_id : semifinal2Result.home_team_id;
  
  // Buscar nombres de equipos
  var sf1WinnerName = semifinal1Result.home_team_id === sf1Winner ? 
                      semifinal1Result.home_team_name : semifinal1Result.away_team_name;
  var sf1LoserName = semifinal1Result.home_team_id === sf1Winner ? 
                     semifinal1Result.away_team_name : semifinal1Result.home_team_name;
  var sf2WinnerName = semifinal2Result.home_team_id === sf2Winner ? 
                      semifinal2Result.home_team_name : semifinal2Result.away_team_name;
  var sf2LoserName = semifinal2Result.home_team_id === sf2Winner ? 
                     semifinal2Result.away_team_name : semifinal2Result.home_team_name;
  
  var updatedMatches = existingMatches.map(function(match) {
    if (match.match_type === 'final') {
      return {
        ...match,
        home_team_id: sf1Winner,
        away_team_id: sf2Winner,
        home_team_name: sf1WinnerName,
        away_team_name: sf2WinnerName,
        status: 'scheduled'
      };
    }
    if (match.match_type === 'third_place') {
      return {
        ...match,
        home_team_id: sf1Loser,
        away_team_id: sf2Loser,
        home_team_name: sf1LoserName,
        away_team_name: sf2LoserName,
        status: 'scheduled'
      };
    }
    return match;
  });
  
  console.log('✅ Final y 3er puesto actualizados');
  return updatedMatches;
}