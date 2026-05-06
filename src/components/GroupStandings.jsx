// src/components/GroupStandings.jsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import styles from "../styles/GroupStandings.module.css";

export default function GroupStandings() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStandings = async () => {
      // 1. Obtener grupos y asignaciones
      const {  groupsData } = await supabase.from("groups").select("id, name").order("draw_order");
      const {  assignments } = await supabase.from("group_assignments").select("group_id, team_id, profiles!group_assignments_team_id_fkey(team_name, badge_url)");
      
      // 2. Obtener partidos finalizados
      const {  matchesData } = await supabase.from("matches").select("group_id, home_team_id, away_team_id, home_score, away_score").eq("status", "finished");

      // 3. Calcular clasificación por grupo
      const standings = groupsData.map(group => {
        const teamIds = assignments.filter(a => a.group_id === group.id).map(a => a.team_id);
        const teamsMap = {};
        
        teamIds.forEach(id => {
          const profile = assignments.find(a => a.team_id === id)?.profiles;
          teamsMap[id] = { id, name: profile?.team_name || "Equipo", badge: profile?.badge_url, pts: 0, w: 0, l: 0, sf: 0, sc: 0 };
        });

        matchesData.filter(m => m.group_id === group.id).forEach(m => {
          const home = teamsMap[m.home_team_id];
          const away = teamsMap[m.away_team_id];
          if (!home || !away) return;

          home.sf += m.home_score; home.sc += m.away_score;
          away.sf += m.away_score; away.sc += m.home_score;

          if (m.home_score > m.away_score) { home.w++; home.pts += 3; away.l++; away.pts += m.away_score === 2 ? 1 : 0; }
          else { away.w++; away.pts += 3; home.l++; home.pts += m.home_score === 2 ? 1 : 0; }
        });

        return {
          ...group,
          teams: Object.values(teamsMap).sort((a, b) => b.pts - a.pts || (b.sf - b.sc) - (a.sf - a.sc))
        };
      });

      setGroups(standings);
      setLoading(false);
    };

    fetchStandings();
    const channel = supabase.channel('standings_live').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: 'status=eq.finished' }, () => fetchStandings()).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  if (loading) return <div className={styles.loading}>Cargando clasificaciones...</div>;

  return (
    <div className={styles.container}>
      <h3 className={styles.title}> Clasificación por Grupos</h3>
      <div className={styles.grid}>
        {groups.map(g => (
          <div key={g.id} className={styles.card}>
            <h4 className={styles.groupName}>{g.name}</h4>
            <table className={styles.table}>
              <thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>V</th><th>D</th><th>Sets</th><th>Pts</th></tr></thead>
              <tbody>
                {g.teams.map((t, i) => (
                  <tr key={t.id}>
                    <td>{i + 1}</td>
                    <td><div className={styles.teamCell}><img src={t.badge} alt="" className={styles.miniBadge}/>{t.name}</div></td>
                    <td>{t.w + t.l}</td><td>{t.w}</td><td>{t.l}</td><td>{t.sf}-{t.sc}</td><td><strong>{t.pts}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}