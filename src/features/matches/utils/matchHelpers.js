// src/features/matches/utils/matchHelpers.js

export function formatMatchDate(isoString) {
  if (!isoString) return { dateStr: '-', timeStr: '-' };
  const date = new Date(isoString);
  return {
    dateStr: date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }),
    timeStr: date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  };
}

export function getMatchStatusConfig(status) {
  const configs = {
    scheduled: { label: 'Programado', variant: 'scheduled', isLive: false },
    live: { label: '🔴 EN VIVO', variant: 'live', isLive: true },
    finished: { label: 'Finalizado', variant: 'finished', isLive: false }
  };
  return configs[status] || configs.scheduled;
}

export function calculateMatchResult(match, userTeamId) {
  if (match.status !== 'finished') return null;
  const isHome = match.home?.id === userTeamId;
  const myScore = isHome ? match.home_score : match.away_score;
  const oppScore = isHome ? match.away_score : match.home_score;
  
  if (myScore > oppScore) return 'win';
  if (myScore < oppScore) return 'loss';
  return 'draw';
}