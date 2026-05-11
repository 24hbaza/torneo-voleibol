/**
 * Calcula la clasificación del grupo.
 * Usa sets_details si existe, sino usa live_points como fallback
 */

// ============================================================================
// PARSER UNIVERSAL - Soporta string JSON y array directo
// ============================================================================
function parseSetsDetails(setsDetails, liveHome, liveAway) {
  // Intentar 1: sets_details
  if (setsDetails) {
    try {
      let sets = setsDetails;

      // Si viene como string (caso común en Supabase), parsear
      if (typeof setsDetails === 'string') {
        sets = JSON.parse(setsDetails);
        
        // Doble parse si es necesario
        if (typeof sets === 'string') {
          sets = JSON.parse(sets);
        }
      }

      // Validar que sea array
      if (Array.isArray(sets) && sets.length > 0) {
        let homeSets = 0;
        let awaySets = 0;
        let homePoints = 0;
        let awayPoints = 0;

        sets.forEach((set, idx) => {
          let h = 0;
          let a = 0;

          // Formato [25, 21]
          if (Array.isArray(set)) {
            h = Number(set[0]) || 0;
            a = Number(set[1]) || 0;
          }
          // Formato {home: 25, away: 21}
          else if (typeof set === 'object' && set !== null) {
            h = Number(set.home) || 0;
            a = Number(set.away) || 0;
          }

          if (h === 0 && a === 0) return;

          homePoints += h;
          awayPoints += a;

          if (h > a) homeSets++;
          else if (a > h) awaySets++;
        });

        return {
          homeSets,
          awaySets,
          homePoints,
          awayPoints
        };
      }
    } catch (err) {
      console.warn('⚠️ Error parseando sets_details:', err);
    }
  }

  // Intentar 2: live_points como fallback
  if (liveHome != null && liveAway != null) {
    const h = Number(liveHome) || 0;
    const a = Number(liveAway) || 0;

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

// ============================================================================
// CÁLCULO DE CLASIFICACIÓN
// ============================================================================
export function calculateGroupStandings(group, assignments = [], matches = []) {
  if (!group?.id) {
    console.warn('❌ Grupo inválido');
    return [];
  }

  console.log(`\n🔍 Procesando grupo: ${group.name}`);
  console.log(`   Group ID: ${group.id}`);

  const groupMatches = matches.filter(m => {
    const isGroupMatch = m?.group_id === group.id;
    const status = String(m?.status || '').toLowerCase();
    const isFinished = status === 'finished' || status === 'completed';
    return isGroupMatch && isFinished;
  });

  console.log(`✅ Partidos finalizados del grupo: ${groupMatches.length}`);

  const groupAssignments = assignments.filter(a => a?.group_id === group.id);

  console.log(`📋 Equipos asignados al grupo: ${groupAssignments.length}`);

  // Inicializar equipos
  const teams = {};
  groupAssignments.forEach(a => {
    if (!a?.team_id) return;
    const teamId = String(a.team_id).trim();
    
    teams[teamId] = {
      id: teamId,
      name: a.profiles?.team_name || 'Equipo',
      badge: a.profiles?.badge_url,
      pj: 0, g: 0, p: 0, pts: 0,
      sf: 0, sc: 0,
      pf: 0, pa: 0,
      h2h: {}
    };
  });

  // Si no hay equipos asignados, retornar array vacío
  if (Object.keys(teams).length === 0) {
    console.log(`⚠️ No hay equipos asignados al grupo ${group.name}`);
    return [];
  }

  // Procesar partidos
  let partidosProcesados = 0;
  let partidosIgnorados = 0;

  groupMatches.forEach((m, idx) => {
    const homeId = String(m.home_team_id).trim();
    const awayId = String(m.away_team_id).trim();

    const home = teams[homeId];
    const away = teams[awayId];

    if (!home || !away) {
      console.warn(`⚠️ Partido ${idx + 1}: Equipos no encontrados (${homeId} vs ${awayId})`);
      partidosIgnorados++;
      return;
    }

    console.log(`\n🏟️ Partido ${idx + 1}: ${home.name} vs ${away.name}`);
    
    // Usar parser
    const matchData = getMatchStats(m);

    if (!matchData) {
      console.warn(`⚠️ Partido ${idx + 1}: IGNORADO - Sin datos válidos`);
      console.log(`   Datos crudos recibidos:`, {
        sets_details: m.sets_details,
        live_home: m.live_points_home,
        live_away: m.live_points_away
      });
      partidosIgnorados++;
      return;
    }

    console.log(`   ✅ Procesado: SF=${matchData.homeSets}-${matchData.awaySets} | PF=${matchData.homePoints}-${matchData.awayPoints}`);
    partidosProcesados++;

    // Actualizar estadísticas
    home.pj += 1;
    away.pj += 1;

    // SETS
    home.sf += matchData.homeSets;
    home.sc += matchData.awaySets;
    away.sf += matchData.awaySets;
    away.sc += matchData.homeSets;

    // PUNTOS TOTALES
    home.pf += matchData.homePoints;
    home.pa += matchData.awayPoints;
    away.pf += matchData.awayPoints;
    away.pa += matchData.homePoints;

    // H2H
    if (!home.h2h[awayId]) home.h2h[awayId] = { pj: 0, sf: 0, sc: 0, pts: 0 };
    if (!away.h2h[homeId]) away.h2h[homeId] = { pj: 0, sf: 0, sc: 0, pts: 0 };

    home.h2h[awayId].pj += 1;
    home.h2h[awayId].sf += matchData.homeSets;
    home.h2h[awayId].sc += matchData.awaySets;
    
    away.h2h[homeId].pj += 1;
    away.h2h[homeId].sf += matchData.awaySets;
    away.h2h[homeId].sc += matchData.homeSets;

    // Puntos de clasificación
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
      home.pts += 1;
      away.pts += 1;
      home.h2h[awayId].pts += 1;
      away.h2h[homeId].pts += 1;
    }
  });

  console.log(`\n📊 RESUMEN ${group.name}: ${partidosProcesados} partidos procesados, ${partidosIgnorados} ignorados`);

  const standings = Object.values(teams);
  return sortWithTiebreakers(standings, groupMatches);
}

// ============================================================================
// ORDENAMIENTO CON DESEMPATES
// ============================================================================
function sortWithTiebreakers(standings, allMatches) {
  const byPoints = {};
  standings.forEach(team => {
    const key = team.pts;
    if (!byPoints[key]) byPoints[key] = [];
    byPoints[key].push({ ...team });
  });

  const pointLevels = Object.keys(byPoints).map(Number).sort((a, b) => b - a);
  const result = [];

  for (const pts of pointLevels) {
    const tiedTeams = byPoints[pts];
    if (tiedTeams.length === 1) {
      result.push(tiedTeams[0]);
    } else {
      const resolved = resolveTie(tiedTeams, allMatches);
      result.push(...resolved);
    }
  }

  return result;
}

function resolveTie(tiedTeams, allMatches) {
  if (tiedTeams.length === 2) {
    const [teamA, teamB] = tiedTeams;
    const h2hA = teamA.h2h[teamB.id];
    const h2hB = teamB.h2h[teamA.id];

    if (h2hA && h2hB) {
      if (h2hA.pts !== h2hB.pts) return h2hA.pts > h2hB.pts ? [teamA, teamB] : [teamB, teamA];
      const diffA = h2hA.sf - h2hA.sc;
      const diffB = h2hB.sf - h2hB.sc;
      if (diffA !== diffB) return diffA > diffB ? [teamA, teamB] : [teamB, teamA];
    }
  }

  const teamIds = new Set(tiedTeams.map(t => t.id));
  const miniStats = {};
  
  tiedTeams.forEach(team => {
    miniStats[team.id] = { id: team.id, pts: 0, diff: 0 };
  });

  allMatches.forEach(m => {
    const homeId = String(m.home_team_id).trim();
    const awayId = String(m.away_team_id).trim();
    
    if (!teamIds.has(homeId) || !teamIds.has(awayId)) return;

    const parsed = parseSetsDetails(m.sets_details, m.live_points_home, m.live_points_away);
    
    let homeSets = 0;
    let awaySets = 0;

    if (parsed) {
      homeSets = parsed.homeSets;
      awaySets = parsed.awaySets;
    } else {
      homeSets = Number(m.home_score) || 0;
      awaySets = Number(m.away_score) || 0;
    }

    const home = miniStats[homeId];
    const away = miniStats[awayId];
    if (!home || !away) return;

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
  });

  return [...tiedTeams].sort((a, b) => {
    const statA = miniStats[a.id];
    const statB = miniStats[b.id];
    if (statB.pts !== statA.pts) return statB.pts - statA.pts;
    if (statB.diff !== statA.diff) return statB.diff - statA.diff;
    const diffGenA = a.sf - a.sc;
    const diffGenB = b.sf - b.sc;
    if (diffGenB !== diffGenA) return diffGenB - diffGenA;
    return b.pf - a.pf;
  });
}