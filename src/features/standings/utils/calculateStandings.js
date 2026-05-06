// src/features/standings/utils/calculateStandings.js
/**
 * Calcula la clasificación de un grupo a partir de asignaciones y partidos finalizados.
 * Reglas: Victoria = 3pts | Derrota 2-1 = 1pt | Derrota 2-0 = 0pts
 * Criterios de desempate: Puntos > Diferencia de Sets > Sets a Favor
 */
export function calculateGroupStandings(group, assignments, matches) {
  const groupAssignments = assignments.filter(a => a.group_id === group.id);
  const groupMatches = matches.filter(m => m.group_id === group.id);

  const teams = {};
  groupAssignments.forEach(a => {
    teams[a.team_id] = {
      id: a.team_id,
      name: a.profiles?.team_name || 'Equipo',
      badge: a.profiles?.badge_url,
      pts: 0, w: 0, l: 0, sf: 0, sa: 0
    };
  });

  groupMatches.forEach(m => {
    const home = teams[m.home_team_id];
    const away = teams[m.away_team_id];
    if (!home || !away) return;

    home.sf += m.home_score || 0;
    home.sa += m.away_score || 0;
    away.sf += m.away_score || 0;
    away.sa += m.home_score || 0;

    if (m.home_score > m.away_score) {
      home.w++; home.pts += 3;
      away.l++; if (m.away_score === 2) away.pts += 1;
    } else {
      away.w++; away.pts += 3;
      home.l++; if (m.home_score === 2) home.pts += 1;
    }
  });

  return Object.values(teams).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const diffA = a.sf - a.sa;
    const diffB = b.sf - b.sa;
    if (diffB !== diffA) return diffB - diffA;
    return b.sf - a.sf;
  });
}