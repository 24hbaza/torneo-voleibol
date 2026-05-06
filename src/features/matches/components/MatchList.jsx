// src/features/matches/components/MatchList.jsx
import MatchCard from './MatchCard';
import styles from './MatchList.module.css';

export default function MatchList({ matches, userTeamId, viewMode = 'list', loading }) {
  if (loading) {
    return (
      <div className={styles.loading}>
        {[1,2,3].map(i => <div key={i} className={styles.skeletonCard} />)}
      </div>
    );
  }

  if (!matches?.length) {
    return <div className={styles.empty}>No hay partidos que coincidan con los filtros.</div>;
  }

  if (viewMode === 'calendar') {
    // Agrupar por fecha para vista calendario
    const grouped = matches.reduce((acc, match) => {
      const date = match.match_date.split('T')[0];
      if (!acc[date]) acc[date] = [];
      acc[date].push(match);
      return acc;
    }, {});

    return (
      <div className={styles.calendarView}>
        {Object.entries(grouped).map(([date, dayMatches]) => (
          <div key={date} className={styles.dayGroup}>
            <h3 className={styles.dayHeader}>{new Date(date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
            <div className={styles.list}>
              {dayMatches.map(match => (
                <MatchCard key={match.id} match={match} userTeamId={userTeamId} compact />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`${styles.listView} ${styles[viewMode]}`}>
      {matches.map(match => (
        <MatchCard key={match.id} match={match} userTeamId={userTeamId} />
      ))}
    </div>
  );
}