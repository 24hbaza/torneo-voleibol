// src/lib/bracketUtils.js
export const isPowerOfTwo = (n) => n > 0 && (n & (n - 1)) === 0;

export const generateBracketMatches = (standings, numGroups, teamsAdvancing) => {
  const totalAdvancing = numGroups * teamsAdvancing;
  if (!isPowerOfTwo(totalAdvancing)) {
    throw new Error(`El total de clasificados (${totalAdvancing}) no es potencia de 2. Ajusta grupos o plazas.`);
  }

  // 1. Preparar lista de equipos clasificados ordenados por ranking
  const qualified = [];
  for (let g = 1; g <= numGroups; g++) {
    const groupStandings = standings.filter(s => s.group_id === g).sort((a, b) => a.rank - b.rank);
    for (let i = 0; i < teamsAdvancing; i++) {
      if (groupStandings[i]) {
        qualified.push({
          team_id: groupStandings[i].team_id,
          group: g,
          seed: `${g}-${i + 1}`
        });
      }
    }
  }

  if (qualified.length !== totalAdvancing) {
    throw new Error(`Faltan equipos clasificados. Se esperan ${totalAdvancing}, se encontraron ${qualified.length}.`);
  }

  // 2. Sembrado clásico: 1º vs último, 2º vs penúltimo, etc.
  qualified.sort((a, b) => {
    const rankA = parseInt(a.seed.split('-')[1]);
    const rankB = parseInt(b.seed.split('-')[1]);
    return rankA - rankB;
  });

  const totalRounds = Math.log2(totalAdvancing);
  let matchesByRound = [];
  let previousRoundMatches = [];

  // 3. Generar rondas desde cuartos/semis hacia la final
  for (let r = totalRounds; r >= 1; r--) {
    const matchesInRound = Math.pow(2, r - 1);
    const currentMatches = [];
    
    for (let i = 0; i < matchesInRound; i++) {
      const matchId = crypto.randomUUID();
      let home = null, away = null;

      if (r === totalRounds) {
        // Primera ronda: emparejar semillas
        home = qualified[i].team_id;
        away = qualified[totalAdvancing - 1 - i].team_id;
      } else {
        // Rondas siguientes: vincular con next_match_id de la ronda anterior
        const nextMatch = previousRoundMatches[i * 2]; // El ganador de este y el siguiente partido va aquí
        // Marcamos que los partidos de la ronda anterior apuntan a este
        previousRoundMatches[i * 2].next_match_id = matchId;
        previousRoundMatches[i * 2 + 1].next_match_id = matchId;
      }

      currentMatches.push({
        id: matchId,
        phase: 'playoff',
        round: r, // 1 = Final, 2 = Semis, etc.
        home_team_id: home,
        away_team_id: away,
        status: r === totalRounds ? 'scheduled' : 'pending',
        next_match_id: null,
        winner_team_id: null,
        match_date: null, // Se asignará en config admin
        court_number: null,
        verification_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
        points_to_win: 25,
        sets_to_win: 2
      });
    }
    
    matchesByRound.unshift(...currentMatches);
    previousRoundMatches = currentMatches;
  }

  return matchesByRound;
};