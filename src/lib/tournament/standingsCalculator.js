// src/lib/tournament/standingsCalculator.js

/**
 * Calcula la clasificación de un grupo (reutiliza tu lógica existente)
 * Soporta sets_details y live_points
 */

function parseSetsDetails(setsDetails, liveHome, liveAway) {
  if (setsDetails) {
    try {
      var sets = setsDetails;
      
      if (typeof setsDetails === 'string') {
        sets = JSON.parse(setsDetails);
        if (typeof sets === 'string') {
          sets = JSON.parse(sets);
        }
      }
      
      if (Array.isArray(sets) && sets.length > 0) {
        var homeSets = 0;
        var awaySets = 0;
        var homePoints = 0;
        var awayPoints = 0;
        
        for (var i = 0; i < sets.length; i++) {
          var set = sets[i];
          var h = 0;
          var a = 0;
          
          if (Array.isArray(set)) {
            h = Number(set[0]) || 0;
            a = Number(set[1]) || 0;
          } else if (typeof set === 'object' && set !== null) {
            h = Number(set.home) || 0;
            a = Number(set.away) || 0;
          }
          
          if (h === 0 && a === 0) continue;
          
          homePoints += h;
          awayPoints += a;
          
          if (h > a) homeSets++;
          else if (a > h) awaySets++;
        }
        
        return {
          homeSets: homeSets,
          awaySets: awaySets,
          homePoints: homePoints,
          awayPoints: awayPoints
        };
      }
    } catch (err) {
      console.warn('⚠️ Error parseando sets_details:', err);
    }
  }
  
  if (liveHome != null && liveAway != null) {
    var h = Number(liveHome) || 0;
    var a = Number(liveAway) || 0;
    
    return {
      homeSets: h,
      awaySets: a,
      homePoints: h,
      awayPoints: a
    };
  }
  
  return null;
}

function getMatchStats(match) {
  return parseSetsDetails(match.sets_details, match.live_points_home, match.live_points_away);
}

/**
 * Calcula standings completos con desempates
 */
export function calculateGroupStandings(group, assignments, matches) {
  if (!group || !group.id) {
    console.warn('❌ Grupo inválido');
    return [];
  }
  
  console.log('🔍 Procesando grupo:', group.name);
  
  // Filtrar partidos finalizados del grupo
  var groupMatches = matches.filter(function(m) {
    var isGroupMatch = m && m.group_id === group.id;
    var status = String(m && m.status || '').toLowerCase();
    var isFinished = status === 'finished' || status === 'completed';
    return isGroupMatch && isFinished;
  });
  
  console.log('✅ Partidos finalizados:', groupMatches.length);
  
  // Filtrar asignaciones del grupo
  var groupAssignments = assignments.filter(function(a) {
    return a && a.group_id === group.id;
  });
  
  // Inicializar equipos
  var teams = {};
  for (var i = 0; i < groupAssignments.length; i++) {
    var a = groupAssignments[i];
    if (!a || !a.team_id) continue;
    
    var teamId = String(a.team_id).trim();
    teams[teamId] = {
      id: teamId,
      name: a.profiles ? a.profiles.team_name : 'Equipo',
      badge: a.profiles ? a.profiles.badge_url : null,
      original_group_id: a.group_id,
      pj: 0,
      g: 0,
      p: 0,
      pts: 0,
      sf: 0,
      sc: 0,
      pf: 0,
      pa: 0,
      h2h: {}
    };
  }
  
  // Procesar partidos
  var partidosProcesados = 0;
  
  for (var mIdx = 0; mIdx < groupMatches.length; mIdx++) {
    var m = groupMatches[mIdx];
    var homeId = String(m.home_team_id).trim();
    var awayId = String(m.away_team_id).trim();
    
    var home = teams[homeId];
    var away = teams[awayId];
    
    if (!home || !away) {
      console.warn('⚠️ Partido ignorado: equipos no encontrados');
      continue;
    }
    
    var matchData = getMatchStats(m);
    
    if (!matchData) {
      console.warn('⚠️ Partido ignorado: sin datos válidos');
      continue;
    }
    
    partidosProcesados++;
    
    // Actualizar estadísticas
    home.pj += 1;
    away.pj += 1;
    
    home.sf += matchData.homeSets;
    home.sc += matchData.awaySets;
    away.sf += matchData.awaySets;
    away.sc += matchData.homeSets;
    
    home.pf += matchData.homePoints;
    home.pa += matchData.awayPoints;
    away.pf += matchData.awayPoints;
    away.pa += matchData.homePoints;
    
    // H2H
    if (!home.h2h[awayId]) {
      home.h2h[awayId] = { pj: 0, sf: 0, sc: 0, pts: 0 };
    }
    if (!away.h2h[homeId]) {
      away.h2h[homeId] = { pj: 0, sf: 0, sc: 0, pts: 0 };
    }
    
    home.h2h[awayId].pj += 1;
    home.h2h[awayId].sf += matchData.homeSets;
    home.h2h[awayId].sc += matchData.awaySets;
    
    away.h2h[homeId].pj += 1;
    away.h2h[homeId].sf += matchData.awaySets;
    away.h2h[homeId].sc += matchData.homeSets;
    
    // Puntos de clasificación (2 por victoria, 1 por derrota)
    if (matchData.homeSets > matchData.awaySets) {
      home.g += 1;
      home.pts += 2;
      away.p += 1;
      away.pts += 1;
      home.h2h[awayId].pts += 2;
      away.h2h[homeId].pts += 1;
    } else if (matchData.awaySets > matchData.homeSets) {
      away.g += 1;
      away.pts += 2;
      home.p += 1;
      home.pts += 1;
      away.h2h[homeId].pts += 2;
      home.h2h[awayId].pts += 1;
    } else {
      // Empate (raro en voleibol pero posible)
      home.pts += 1;
      away.pts += 1;
      home.h2h[awayId].pts += 1;
      away.h2h[homeId].pts += 1;
    }
  }
  
  console.log('📊 Partidos procesados:', partidosProcesados);
  
  var standings = Object.values(teams);
  return sortWithTiebreakers(standings, groupMatches);
}

function sortWithTiebreakers(standings, allMatches) {
  var byPoints = {};
  
  for (var i = 0; i < standings.length; i++) {
    var team = standings[i];
    var key = team.pts;
    if (!byPoints[key]) byPoints[key] = [];
    byPoints[key].push(JSON.parse(JSON.stringify(team))); // Deep copy
  }
  
  var pointLevels = Object.keys(byPoints).map(Number).sort(function(a, b) { return b - a; });
  var result = [];
  
  for (var pIdx = 0; pIdx < pointLevels.length; pIdx++) {
    var pts = pointLevels[pIdx];
    var tiedTeams = byPoints[pts];
    
    if (tiedTeams.length === 1) {
      result.push(tiedTeams[0]);
    } else {
      var resolved = resolveTie(tiedTeams, allMatches);
      result = result.concat(resolved);
    }
  }
  
  // Añadir posición final
  for (var rIdx = 0; rIdx < result.length; rIdx++) {
    result[rIdx].position = rIdx + 1;
  }
  
  return result;
}

function resolveTie(tiedTeams, allMatches) {
  if (tiedTeams.length === 2) {
    var teamA = tiedTeams[0];
    var teamB = tiedTeams[1];
    var h2hA = teamA.h2h[teamB.id];
    var h2hB = teamB.h2h[teamA.id];
    
    if (h2hA && h2hB) {
      if (h2hA.pts !== h2hB.pts) {
        return h2hA.pts > h2hB.pts ? [teamA, teamB] : [teamB, teamA];
      }
      var diffA = h2hA.sf - h2hA.sc;
      var diffB = h2hB.sf - h2hB.sc;
      if (diffA !== diffB) {
        return diffA > diffB ? [teamA, teamB] : [teamB, teamA];
      }
    }
  }
  
  // Mini-liga entre empatados
  var teamIds = {};
  for (var tIdx = 0; tIdx < tiedTeams.length; tIdx++) {
    teamIds[tiedTeams[tIdx].id] = true;
  }
  
  var miniStats = {};
  for (var msIdx = 0; msIdx < tiedTeams.length; msIdx++) {
    var team = tiedTeams[msIdx];
    miniStats[team.id] = { id: team.id, pts: 0, diff: 0 };
  }
  
  for (var mIdx = 0; mIdx < allMatches.length; mIdx++) {
    var m = allMatches[mIdx];
    var homeId = String(m.home_team_id).trim();
    var awayId = String(m.away_team_id).trim();
    
    if (!teamIds[homeId] || !teamIds[awayId]) continue;
    
    var parsed = parseSetsDetails(m.sets_details, m.live_points_home, m.live_points_away);
    var homeSets = 0;
    var awaySets = 0;
    
    if (parsed) {
      homeSets = parsed.homeSets;
      awaySets = parsed.awaySets;
    } else {
      homeSets = Number(m.home_score) || 0;
      awaySets = Number(m.away_score) || 0;
    }
    
    var home = miniStats[homeId];
    var away = miniStats[awayId];
    if (!home || !away) continue;
    
    home.diff += homeSets - awaySets;
    away.diff += awaySets - homeSets;
    
    if (homeSets > awaySets) {
      home.pts += 2;
      away.pts += 1;
    } else if (awaySets > homeSets) {
      away.pts += 2;
      home.pts += 1;
    } else {
      home.pts += 1;
      away.pts += 1;
    }
  }
  
  // Ordenar por mini-liga, luego diferencia general, luego puntos a favor
  return [].concat(tiedTeams).sort(function(a, b) {
    var statA = miniStats[a.id];
    var statB = miniStats[b.id];
    
    if (statB.pts !== statA.pts) return statB.pts - statA.pts;
    if (statB.diff !== statA.diff) return statB.diff - statA.diff;
    
    var diffGenA = a.sf - a.sc;
    var diffGenB = b.sf - b.sc;
    if (diffGenB !== diffGenA) return diffGenB - diffGenA;
    
    return b.pf - a.pf;
  });
}

/**
 * Obtiene los equipos clasificados de todos los grupos
 */
export function getQualifiedTeams(allGroups, allAssignments, allMatches, teamsAdvancingPerGroup) {
  var qualified = [];
  
  for (var gIdx = 0; gIdx < allGroups.length; gIdx++) {
    var group = allGroups[gIdx];
    var standings = calculateGroupStandings(group, allAssignments, allMatches);
    
    // Tomar los N primeros clasificados
    var qualifiers = standings.slice(0, teamsAdvancingPerGroup);
    
    for (var qIdx = 0; qIdx < qualifiers.length; qIdx++) {
      var team = qualifiers[qIdx];
      qualified.push({
        id: team.id,
        team_name: team.name,
        original_group_id: group.id,
        original_group_name: group.name,
        position_in_group: qIdx + 1, // 1 = primero, 2 = segundo, etc.
        points: team.pts,
        sets_diff: team.sf - team.sc
      });
    }
    
    console.log('✅ Grupo', group.name, ':', qualifiers.length, 'clasificados');
  }
  
  return qualified;
}