// src/lib/bracketUtils.js
export const isPowerOfTwo = (n) => n > 0 && (n & (n - 1)) === 0;

export const generateBracketMatches = (standings, numGroups, teamsAdvancing) => {
  const totalAdvancing = numGroups * teamsAdvancing;
  
  if (!isPowerOfTwo(totalAdvancing)) {
    throw new Error(`El total de clasificados (${totalAdvancing}) no es potencia de 2. Ajusta grupos o plazas.`);
  }

  // 1. Filtrar y ordenar clasificados por grupo
  const qualified = [];
  for (let g = 1; g <= numGroups; g++) {
    const groupTeams = standings
      .filter(s => s.group_id === g)
      .sort((a, b) => b.pts - a.pts || b.w - a.l);
    
    for (let i = 0; i < teamsAdvancing; i++) {
      if (groupTeams[i]) {
        qualified.push({ team_id: groupTeams[i].team_id, group: g, seed: i + 1 });
      }
    }
  }

  if (qualified.length !== totalAdvancing) {
    throw new Error(`Faltan equipos clasificados. Se esperan ${totalAdvancing}, se encontraron ${qualified.length}.`);
  }

  // 2. Sembrado: 1º vs último, 2º vs penúltimo, etc.
  qualified.sort((a, b) => a.seed - b.seed);
  const totalRounds = Math.log2(totalAdvancing);
  let matchesToInsert = [];
  let currentRoundMatches = [];

  // Generar primera ronda (la más alta numéricamente, ej: 2 = Semis, 3 = Cuartos)
  for (let i = 0; i < totalAdvancing / 2; i++) {
    currentRoundMatches.push({
      id: crypto.randomUUID(),
      phase: 'playoff',
      round: totalRounds,
      home_team_id: qualified[i].team_id,
      away_team_id: qualified[totalAdvancing - 1 - i].team_id,
      status: 'scheduled',
      next_match_id: null,
      winner_team_id: null,
      match_date: null,
      court_number: null,
      verification_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
      points_to_win: 25,
      sets_to_win: 2
    });
  }
  matchesToInsert.push(...currentRoundMatches);

  // 3. Generar rondas siguientes vinculando IDs
  let prevRound = currentRoundMatches;
  for (let r = totalRounds - 1; r >= 1; r--) {
    const nextRoundMatches = [];
    for (let i = 0; i < prevRound.length / 2; i++) {
      const matchId = crypto.randomUUID();
      prevRound[i * 2].next_match_id = matchId;
      prevRound[i * 2 + 1].next_match_id = matchId;

      nextRoundMatches.push({
        id: matchId,
        phase: 'playoff',
        round: r, // 1 = Final
        home_team_id: null,
        away_team_id: null,
        status: 'pending',
        next_match_id: null,
        winner_team_id: null,
        match_date: null,
        court_number: null,
        verification_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
        points_to_win: 25,
        sets_to_win: 2
      });
    }
    matchesToInsert.push(...nextRoundMatches);
    prevRound = nextRoundMatches;
  }

  return matchesToInsert;
};