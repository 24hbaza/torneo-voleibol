// src/lib/tournament/previewScheduler.js
// Algoritmo de scheduling extraído para poder reutilizarlo

/**
 * Verifica si un equipo puede jugar en una fecha/hora específica
 */
export const canTeamPlay = function(team, matchDate) {
  if (!team.availability || !Array.isArray(team.availability) || team.availability.length === 0) {
    return true;
  }
  
  const matchTime = matchDate.getTime();
  
  for (let i = 0; i < team.availability.length; i++) {
    const avail = team.availability[i];
    
    if (!avail.start_datetime || !avail.end_datetime) {
      continue;
    }
    
    const startDateTime = new Date(avail.start_datetime).getTime();
    const endDateTime = new Date(avail.end_datetime).getTime();
    
    if (matchTime >= startDateTime && matchTime < endDateTime) {
      return false;
    }
  }
  
  return true;
};

/**
 * Verifica si una hora está dentro de la franja horaria global sin partidos
 * Franja: 21:15 a 21:30 todos los días (sorteo)
 */
export const isBlackoutTime = function(date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  const blackoutStart = 21 * 60 + 15;
  const blackoutEnd = 21 * 60 + 30;
  
  return timeInMinutes >= blackoutStart && timeInMinutes < blackoutEnd;
};

/**
 * Si la hora actual está en la franja prohibida, avanza hasta las 21:30
 */
export const skipBlackout = function(currentTime) {
  const date = new Date(currentTime);
  
  if (isBlackoutTime(date)) {
    date.setHours(21, 30, 0, 0);
    return date.getTime();
  }
  
  return currentTime;
};

/**
 * Generador de jornadas round-robin
 */
export const generateRoundRobinMatches = function(teams, isDouble) {
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
        roundMatches.push({ home: home.id, away: away.id });
      }
    }
    rounds.push(roundMatches);
    
    var first = teamsCopy[0];
    var rest = teamsCopy.slice(1);
    teamsCopy = [first].concat(rest.slice(1), [rest[0]]);
  }
  
  if (isDouble) {
    var returnRounds = rounds.map(function(round) {
      return round.map(function(match) {
        return { home: match.away, away: match.home };
      });
    });
    rounds = rounds.concat(returnRounds);
  }
  
  return rounds;
};

/**
 * Genera el calendario completo (preview)
 * @param {Array} groupsWithTeams - Grupos con sus equipos
 * @param {Object} config - Configuración del torneo
 * @param {Function} onLog - Función de logging
 * @returns {Array} - Array de partidos programados
 */
export const scheduleMatchesPreview = function(groupsWithTeams, config, onLog) {
  var num_courts = config.num_courts;
  var match_duration_minutes = config.match_duration_minutes || 45;
  var buffer_minutes = config.buffer_minutes || 0;
  var start_datetime = config.start_datetime;
  var match_format = config.match_format;

  var duration = (match_duration_minutes + buffer_minutes) * 60000;
  var currentTime = new Date(start_datetime).getTime();
  var scheduled = [];

  currentTime = skipBlackout(currentTime);

  var teamBusyUntil = {};
  var teamLastPlayed = {};
  var teamRefereeCount = {};
  var teamPlayedCount = {};

  groupsWithTeams.forEach(function(group) {
    group.teams.forEach(function(team) {
      if (!team.isBye) {
        teamBusyUntil[team.id] = 0;
        teamLastPlayed[team.id] = 0;
        teamRefereeCount[team.id] = 0;
        teamPlayedCount[team.id] = 0;
      }
    });
  });

  var pendingMatches = [];

  groupsWithTeams.forEach(function(group) {
    var rounds = generateRoundRobinMatches(
      group.teams,
      match_format === 'double'
    );

    rounds.forEach(function(roundMatches, roundIndex) {
      roundMatches.forEach(function(match) {
        pendingMatches.push({
          group_id: group.id,
          home_team_id: match.home,
          away_team_id: match.away,
          round: roundIndex + 1
        });
      });
    });
  });

  var allTeams = groupsWithTeams.flatMap(function(g) {
    return g.teams.filter(function(t) { return !t.isBye; });
  });

  var adminTeamIds = [];
  for (var at = 0; at < allTeams.length; at++) {
    var team = allTeams[at];
    if (team.is_admin_team === true) {
      adminTeamIds.push(team.id);
    }
  }

  var maxAttempts = 1000;
  var attempts = 0;
  
  while (pendingMatches.length > 0 && attempts < maxAttempts) {
    attempts++;
    
    currentTime = skipBlackout(currentTime);
    
    var slotMatches = [];
    var slotPlayingTeams = new Set();
    var slotReferees = new Set();

    var slotDate = new Date(currentTime);

    var availableMatches = pendingMatches.filter(function(match) {
      var homeFree = (teamBusyUntil[match.home_team_id] || 0) <= currentTime;
      var awayFree = (teamBusyUntil[match.away_team_id] || 0) <= currentTime;

      var homeTeam = allTeams.find(function(t) { return t.id === match.home_team_id; });
      var awayTeam = allTeams.find(function(t) { return t.id === match.away_team_id; });
      
      var homeAvailable = canTeamPlay(homeTeam, slotDate);
      var awayAvailable = canTeamPlay(awayTeam, slotDate);

      return (
        homeFree &&
        awayFree &&
        homeAvailable &&
        awayAvailable &&
        !slotPlayingTeams.has(match.home_team_id) &&
        !slotPlayingTeams.has(match.away_team_id)
      );
    });

    availableMatches.sort(function(a, b) {
      var aWait = currentTime - Math.max(
        teamLastPlayed[a.home_team_id] || 0,
        teamLastPlayed[a.away_team_id] || 0
      );

      var bWait = currentTime - Math.max(
        teamLastPlayed[b.home_team_id] || 0,
        teamLastPlayed[b.away_team_id] || 0
      );

      var aPlayed = teamPlayedCount[a.home_team_id] + teamPlayedCount[a.away_team_id];
      var bPlayed = teamPlayedCount[b.home_team_id] + teamPlayedCount[b.away_team_id];

      if (bWait !== aWait) {
        return bWait - aWait;
      }

      return aPlayed - bPlayed;
    });

    for (var court = 1; court <= num_courts; court++) {
      var selectedMatch = null;
      
      for (var i = 0; i < availableMatches.length; i++) {
        var match = availableMatches[i];
        
        if (slotPlayingTeams.has(match.home_team_id) || 
            slotPlayingTeams.has(match.away_team_id)) {
          continue;
        }

        selectedMatch = match;
        break;
      }

      if (!selectedMatch) {
        break;
      }

      slotMatches.push({ ...selectedMatch, court: court });
      slotPlayingTeams.add(selectedMatch.home_team_id);
      slotPlayingTeams.add(selectedMatch.away_team_id);

      var idx = availableMatches.indexOf(selectedMatch);
      if (idx !== -1) {
        availableMatches.splice(idx, 1);
      }
    }

    if (slotMatches.length === 0) {
      var nextFree = Object.values(teamBusyUntil).filter(function(t) {
        return t > currentTime;
      });

      if (nextFree.length > 0) {
        currentTime = Math.min.apply(null, nextFree);
      } else {
        currentTime = currentTime + duration;
      }
      continue;
    }

    var newPending = [];
    for (var p = 0; p < pendingMatches.length; p++) {
      var pm = pendingMatches[p];
      var isUsed = false;
      for (var s = 0; s < slotMatches.length; s++) {
        var sm = slotMatches[s];
        if (sm.home_team_id === pm.home_team_id &&
            sm.away_team_id === pm.away_team_id &&
            sm.round === pm.round) {
          isUsed = true;
          break;
        }
      }
      if (!isUsed) {
        newPending.push(pm);
      }
    }
    pendingMatches = newPending;

    var endTime = currentTime + duration;

    for (var m = 0; m < slotMatches.length; m++) {
      var match = slotMatches[m];

      var groupTeams = null;
      for (var g = 0; g < groupsWithTeams.length; g++) {
        if (groupsWithTeams[g].id === match.group_id) {
          groupTeams = groupsWithTeams[g].teams;
          break;
        }
      }
      if (!groupTeams) {
        groupTeams = [];
      }

      var possibleRefs = [];
      for (var t = 0; t < groupTeams.length; t++) {
        var team = groupTeams[t];
        if (!team.isBye &&
            team.id !== match.home_team_id &&
            team.id !== match.away_team_id &&
            !slotPlayingTeams.has(team.id) &&
            !slotReferees.has(team.id) &&
            (teamBusyUntil[team.id] || 0) <= currentTime) {
          
          possibleRefs.push(team);
        }
      }

      if (possibleRefs.length === 0) {
        for (var at2 = 0; at2 < allTeams.length; at2++) {
          var team = allTeams[at2];
          if (team.id !== match.home_team_id &&
              team.id !== match.away_team_id &&
              !slotPlayingTeams.has(team.id) &&
              !slotReferees.has(team.id) &&
              (teamBusyUntil[team.id] || 0) <= currentTime) {
            
            possibleRefs.push(team);
          }
        }
      }

      possibleRefs.sort(function(a, b) {
        var aIsAdmin = adminTeamIds.indexOf(a.id) !== -1 ? 1 : 0;
        var bIsAdmin = adminTeamIds.indexOf(b.id) !== -1 ? 1 : 0;
        if (bIsAdmin !== aIsAdmin) {
          return bIsAdmin - aIsAdmin;
        }
        var diff = teamRefereeCount[a.id] - teamRefereeCount[b.id];
        if (diff !== 0) {
          return diff;
        }
        return teamPlayedCount[a.id] - teamPlayedCount[b.id];
      });

      var referee = possibleRefs.length > 0 ? possibleRefs[0] : null;

      if (referee) {
        slotReferees.add(referee.id);
        teamRefereeCount[referee.id] = teamRefereeCount[referee.id] + 1;
      }

      scheduled.push({
        draft_id: 'draft_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        group_id: match.group_id,
        home_team_id: match.home_team_id,
        away_team_id: match.away_team_id,
        round: match.round,
        court_number: match.court,
        referee_team_id: referee ? referee.id : null,
        match_date: new Date(currentTime).toISOString(),
        verification_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
        status: 'scheduled',
        home_score: 0,
        away_score: 0,
        points_to_win: config.points_to_win || 25,
        sets_to_win: config.sets_to_win || 2,
        phase: 'group'
      });

      teamBusyUntil[match.home_team_id] = endTime;
      teamBusyUntil[match.away_team_id] = endTime;
      teamLastPlayed[match.home_team_id] = endTime;
      teamLastPlayed[match.away_team_id] = endTime;
      teamPlayedCount[match.home_team_id] = teamPlayedCount[match.home_team_id] + 1;
      teamPlayedCount[match.away_team_id] = teamPlayedCount[match.away_team_id] + 1;

      if (onLog) {
        onLog(
          '🏟️ P' + match.court + ' | ' + 
          match.home_team_id.slice(0, 4) + ' vs ' + 
          match.away_team_id.slice(0, 4)
        );
      }
    }

    currentTime = currentTime + duration;
  }

  if (attempts >= maxAttempts && onLog) {
    onLog('⚠️ Se alcanzó el límite de intentos.');
  }

  return scheduled;
};