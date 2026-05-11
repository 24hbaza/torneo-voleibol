import { useMemo } from 'react';
import styles from './BracketTree.module.css';

// ============================================
// HELPERS CENTRALIZADOS PARA ESTADOS DE PARTIDOS
// ============================================
const isFinished = (status) => ['finished', 'completed'].includes(status);
const isPlayable = (status) => ['pending', 'scheduled'].includes(status);
const isScheduled = (status) => status === 'scheduled';

export default function BracketTree({ 
  matches = [], 
  teams = [], 
  onEditMatch, 
  showEditButton = false 
}) {
  // Crear mapa de equipos para búsqueda rápida de nombres
  const teamNameMap = useMemo(() => {
    const map = {};
    if (Array.isArray(teams)) {
      teams.forEach(t => {
        if (t?.id) {
          map[t.id] = t.team_name || t.name || 'Equipo';
        }
      });
    }
    return map;
  }, [teams]);

  // Asegurarse de que matches es un array válido
  const safeMatches = Array.isArray(matches) ? matches : [];

  // Agrupar partidos por fase y ronda
  const rounds = useMemo(() => {
    const r = {};
    safeMatches.forEach(m => {
      if (m?.round) {
        const key = `${m.phase}-${m.round}`;
        if (!r[key]) r[key] = [];
        r[key].push(m);
      }
    });
    // Ordenar: primero playoff_group (rondas 1-3), luego playoff_final (rondas 4-5)
    return Object.entries(r).sort(([a], [b]) => {
      const [phaseA, roundA] = a.split('-');
      const [phaseB, roundB] = b.split('-');
      
      if (phaseA === phaseB) {
        return parseInt(roundA) - parseInt(roundB);
      }
      // playoff_group antes que playoff_final
      return phaseA === 'playoff_group' ? -1 : 1;
    });
  }, [safeMatches]);

  // Nombres descriptivos para las rondas
  const getRoundName = (key) => {
    const [phase, roundNum] = key.split('-');
    const num = parseInt(roundNum);
    
    if (phase === 'playoff_group') {
      if (num === 1) return '🏁 Jornada 1 (Grupos Z/W)';
      if (num === 2) return '⚽ Jornada 2 (Grupos Z/W)';
      if (num === 3) return '🔥 Jornada 3 (Grupos Z/W)';
      return `Jornada ${num}`;
    }
    
    if (phase === 'playoff_final') {
      if (num === 4) return '🥊 Semifinales';
      if (num === 5) return '🏆 Final / 3er Puesto';
      return `Ronda ${num}`;
    }
    
    return `Ronda ${num}`;
  };

  // Helper para obtener nombre del equipo
  const getTeamLabel = (match, isHome) => {
    const id = isHome ? match?.home_team_id : match?.away_team_id;
    
    // Si es null o undefined
    if (!id) return 'Por definir';
    
    // Buscar en el mapa de nombres
    if (teamNameMap[id]) {
      return teamNameMap[id];
    }
    
    // Fallback: ID cortado
    return typeof id === 'string' ? id.slice(0, 8) + '...' : 'Equipo';
  };

  // Formatear fecha y hora
  const formatMatchDateTime = (matchDate) => {
    if (!matchDate) return null;
    
    const date = new Date(matchDate);
    if (isNaN(date.getTime())) return null;
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return {
      date: `${day}/${month}`,
      time: `${hours}:${minutes}`
    };
  };

  // Estado vacío
  if (rounds.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
        <p>📭 No hay partidos en esta fase</p>
      </div>
    );
  }

  return (
    <div className={styles.treeContainer}>
      {rounds.map(([roundKey, roundMatches]) => (
        <div key={roundKey} className={styles.roundColumn}>
          <h3 className={styles.roundTitle}>{getRoundName(roundKey)}</h3>
          <div className={styles.matchesList}>
            {roundMatches.map(match => {
              // Validaciones de seguridad
              if (!match?.id) return null;
              
              // Usar helpers centralizados
              const isFinishedMatch = isFinished(match.status);
              const isPendingMatch = match.status === 'pending';
              const isScheduledMatch = isScheduled(match.status);
              const isPlayableMatch = isPlayable(match.status);
              
              const homeWon = isFinishedMatch && match.winner_team_id === match.home_team_id;
              const awayWon = isFinishedMatch && match.winner_team_id === match.away_team_id;
              const dateTime = formatMatchDateTime(match.match_date);
              
              // ✅ CORRECCIÓN: Validación robusta para mostrar botón de edición
              const isPlayoffFinal = match.phase === 'playoff_final';
              const hasEditHandler = typeof onEditMatch === 'function';
              const canEdit = showEditButton && isPlayoffFinal && !isFinishedMatch && hasEditHandler;

              // Debug en consola (solo en desarrollo)
              if (process.env.NODE_ENV !== 'production' && isPlayoffFinal) {
                console.log(`🔍 Match ${match.id}: phase=${match.phase}, status=${match.status}, canEdit=${canEdit}`);
              }

              return (
                <div 
                  key={match.id} 
                  className={`${styles.matchBox} ${isFinishedMatch ? styles.finished : ''} ${isPlayableMatch ? styles.pending : ''}`}
                >
                  
                  {/* ✅ CORRECCIÓN: Botón de edición con mejores prácticas */}
                  {canEdit && (
                    <button 
                      type="button"
                      className={styles.editButton}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log(`✏️ Editando match: ${match.id} - ${match.notes || `Ronda ${match.round}`}`);
                        onEditMatch(match);
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      title="Configurar partido"
                      aria-label={`Editar ${match.notes || `ronda ${match.round}`}`}
                      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                    >
                      ✏️
                    </button>
                  )}
                  
                  {/* Equipo Local */}
                  <div className={`${styles.team} ${homeWon ? styles.winner : ''}`}>
                    <span className={styles.seed}>🏠</span>
                    <span className={styles.name} title={match.home_team_id || 'Por definir'}>
                      {getTeamLabel(match, true)}
                    </span>
                    <span className={styles.score}>
                      {match.home_score !== null && match.home_score !== undefined ? match.home_score : '-'}
                    </span>
                  </div>

                  {/* Equipo Visitante */}
                  <div className={`${styles.team} ${awayWon ? styles.winner : ''}`}>
                    <span className={styles.seed}>✈️</span>
                    <span className={styles.name} title={match.away_team_id || 'Por definir'}>
                      {getTeamLabel(match, false)}
                    </span>
                    <span className={styles.score}>
                      {match.away_score !== null && match.away_score !== undefined ? match.away_score : '-'}
                    </span>
                  </div>

                  {/* Información del partido - Fecha, Hora, Pista y Árbitro */}
                  <div className={styles.matchInfo}>
                    {isScheduledMatch && dateTime && (
                      <>
                        <div className={styles.dateTimeInfo}>
                          <span className={styles.infoIcon}>📅</span>
                          <span className={styles.infoText}>{dateTime.date} - {dateTime.time}</span>
                        </div>
                        
                        {match.court_number && (
                          <div className={styles.courtInfo}>
                            <span className={styles.infoIcon}>🏟️</span>
                            <span className={styles.infoText}>Pista {match.court_number}</span>
                          </div>
                        )}
                        
                        {match.referee_team_id && (
                          <div className={styles.refereeInfo}>
                            <span className={styles.infoIcon}>👤</span>
                            <span className={styles.infoText}>
                              Árbitro: {teamNameMap[match.referee_team_id] || (typeof match.referee_team_id === 'string' ? match.referee_team_id.slice(0, 15) + '...' : 'Por asignar')}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    
                    {isPendingMatch && !match.home_team_id && !match.away_team_id && (
                      <div className={`${styles.pendingInfo} ${styles.emptyMatch}`}>
                        <span className={styles.infoIcon}>⚙️</span>
                        <span className={styles.infoText}>Por configurar</span>
                      </div>
                    )}
                    
                    {isPendingMatch && (match.home_team_id || match.away_team_id) && (
                      <div className={styles.pendingInfo}>
                        <span className={styles.infoIcon}>⏳</span>
                        <span className={styles.infoText}>Pendiente</span>
                      </div>
                    )}
                    
                    {isFinishedMatch && (
                      <div className={styles.finishedInfo}>
                        <span className={styles.infoIcon}>✅</span>
                        <span className={styles.infoText}>Finalizado</span>
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}