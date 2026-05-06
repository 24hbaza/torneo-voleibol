// src/features/standings/components/GroupStandings.jsx
import { useAuthStore } from '../../../store';
import PositionBadge from './PositionBadge';
import styles from './GroupStandings.module.css';

export default function GroupStandings({ group, standings, advancingCount = 1 }) {
  const { profile } = useAuthStore();
  if (!standings?.length) return null;

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <h3 className={styles.title}>{group.name}</h3>
        <span className={styles.count}>{standings.length} equipos</span>
      </header>
      
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Equipo</th>
              <th>PJ</th>
              <th>V</th>
              <th>D</th>
              <th>Sets</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((team, idx) => {
              const position = idx + 1;
              const isMyTeam = team.id === profile?.id;
              // ✅ Zona de clasificación según configuración
              const isQualifying = position <= advancingCount;
              
              return (
                <tr 
                  key={team.id} 
                  className={`
                    ${styles.row} 
                    ${isMyTeam ? styles.myTeam : ''} 
                    ${isQualifying ? styles.qualifying : ''}
                    ${isMyTeam && isQualifying ? styles.myTeamQualifying : ''}
                  `}
                >
                  <td>
                    <PositionBadge position={position} isQualifying={isQualifying} />
                  </td>
                  <td className={styles.teamCell}>
                    {team.badge && <img src={team.badge} alt="" className={styles.badgeImg} />}
                    <span className={styles.name}>{team.name}</span>
                    {isMyTeam && <span className={styles.myBadge}>👤 Tú</span>}
                  </td>
                  <td>{team.w + team.l}</td>
                  <td className={styles.wins}>{team.w}</td>
                  <td className={styles.losses}>{team.l}</td>
                  <td>{team.sf}-{team.sa}</td>
                  <td className={styles.points}>{team.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      <footer className={styles.legend}>
        <span className={styles.dot} style={{ background: 'var(--volley-gold)' }}></span>
        Zona de clasificación ({advancingCount} equipo{advancingCount > 1 ? 's' : ''})
      </footer>
    </article>
  );
}