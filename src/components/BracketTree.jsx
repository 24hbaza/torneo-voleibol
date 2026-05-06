// src/components/BracketTree.jsx
import { useMemo } from 'react';
import styles from './BracketTree.module.css';

export default function BracketTree({ matches }) {
  const rounds = useMemo(() => {
    const r = {};
    matches.forEach(m => {
      if (!r[m.round]) r[m.round] = [];
      r[m.round].push(m);
    });
    return Object.entries(r).sort(([a], [b]) => b - a); // Final primero (round 1)
  }, [matches]);

  const getRoundName = (round) => {
    const names = { 1: '🥇 Final', 2: '🥈 Semifinales', 3: '🥉 Cuartos de Final', 4: 'Octavos' };
    return names[round] || `Ronda ${round}`;
  };

  return (
    <div className={styles.treeContainer}>
      {rounds.map(([roundNum, roundMatches]) => (
        <div key={roundNum} className={styles.roundColumn}>
          <h3 className={styles.roundTitle}>{getRoundName(parseInt(roundNum))}</h3>
          <div className={styles.matchesList}>
            {roundMatches.map(match => {
              const isHomeWinner = match.winner_team_id === match.home_team_id;
              const isAwayWinner = match.winner_team_id === match.away_team_id;
              const isFinished = match.status === 'finished';
              const isLive = match.status === 'live';
              
              return (
                <div 
                  key={match.id} 
                  className={`${styles.matchBox} ${isFinished ? styles.finished : ''} ${isLive ? styles.live : ''}`}
                >
                  <div className={`${styles.team} ${isHomeWinner ? styles.winner : ''}`}>
                    <span className={styles.seed}>🏠</span>
                    <span className={styles.name}>{match.home_team_name || match.home_team_id?.slice(0,4) || 'Por definir'}</span>
                    <span className={styles.score}>{match.home_score ?? '-'}</span>
                  </div>
                  <div className={`${styles.team} ${isAwayWinner ? styles.winner : ''}`}>
                    <span className={styles.seed}>🛫</span>
                    <span className={styles.name}>{match.away_team_name || match.away_team_id?.slice(0,4) || 'Por definir'}</span>
                    <span className={styles.score}>{match.away_score ?? '-'}</span>
                  </div>
                  {match.status === 'scheduled' && <span className={styles.statusBadge}>⏳ Programado</span>}
                  {isLive && <span className={`${styles.statusBadge} ${styles.live}`}>🔴 En Vivo</span>}
                  {isFinished && <span className={`${styles.statusBadge} ${styles.done}`}>✅ Finalizado</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}