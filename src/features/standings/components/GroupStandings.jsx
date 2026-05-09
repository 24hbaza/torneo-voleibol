import styles from './GroupStandings.module.css';

export default function GroupStandings({ group, standings, advancingCount }) {
  return (
    <article className={styles.card}>
      <header className={styles.groupHeader}>
        <div className={styles.groupInfo}>
          <h2 className={styles.groupName}>{group.name || 'Grupo'}</h2>
          {group.description && <p className={styles.groupDesc}>{group.description}</p>}
        </div>
        <div className={styles.advancingBadge}>
          <span className={styles.badgeIcon}>🎫</span>
          <span>{advancingCount} plazas</span>
        </div>
      </header>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colRank}>#</th>
              <th className={styles.colTeam}>Equipo</th>
              <th className={styles.colStat} title="Jugados">PJ</th>
              <th className={styles.colStat} title="Ganados">G</th>
              <th className={styles.colStat} title="Perdidos">P</th>
              <th className={styles.colStat} title="Sets Favor">SF</th>
              <th className={styles.colStat} title="Sets Contra">SC</th>
              <th className={styles.colStat} title="Puntos Favor">PF</th>
              <th className={styles.colStat} title="Puntos Contra">PC</th>
              <th className={styles.colPoints}>PTS</th>
            </tr>
          </thead>
          <tbody>
            {standings.length === 0 ? (
              <tr><td colSpan={10} className={styles.emptyRow}>Sin equipos asignados</td></tr>
            ) : (
              standings.map((team, index) => {
                const position = index + 1;
                const isQualifying = position <= advancingCount;

                return (
                  <tr
                    key={team.id}
                    className={`${styles.row} ${isQualifying ? styles.qualifying : ''}`}
                  >
                    <td className={styles.colRank}>
                      <span className={`${styles.rank} ${isQualifying ? styles.rankQualifying : ''}`}>
                        {position}
                      </span>
                    </td>
                    <td className={styles.colTeam}>
                      <div className={styles.teamCell}>
                        {team.badge && (
                          <img src={team.badge} alt="" className={styles.teamBadge} loading="lazy" />
                        )}
                        <span className={styles.teamName}>{team.name}</span>
                      </div>
                    </td>
                    <td className={styles.colStat}>{team.pj}</td>
                    <td className={`${styles.colStat} ${styles.wins}`}>{team.g}</td>
                    <td className={`${styles.colStat} ${styles.losses}`}>{team.p}</td>
                    <td className={styles.colStat}>{team.sf}</td>
                    <td className={styles.colStat}>{team.sc}</td>
                    <td className={styles.colStat}>{team.pf}</td>
                    <td className={styles.colStat}>{team.pa}</td>
                    <td className={styles.colPoints}>
                      <span className={styles.pointsBadge}>{team.pts}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}