// src/components/TournamentGroups.jsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import styles from "../styles/TournamentGroups.module.css";

export default function TournamentGroups({ userTeamId }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGroups = async () => {
      // 1. Obtener todos los grupos
      const { data: groupsData, error: groupsError } = await supabase
        .from("groups")
        .select("*")
        .order("draw_order");
      
      if (groupsError) { setLoading(false); return; }

      // 2. Para cada grupo, obtener los equipos asignados
      const groupsWithTeams = await Promise.all(
        groupsData.map(async (group) => {
          const { data: assignments, error } = await supabase
            .from("group_assignments")
            .select(`
              team_id,
              profiles!group_assignments_team_id_fkey (id, team_name, badge_url)
            `)
            .eq("group_id", group.id)
            .order("draw_order");
          
          return {
            ...group,
            teams: assignments ? assignments.map(a => a.profiles) : []
          };
        })
      );

      setGroups(groupsWithTeams);
      setLoading(false);
    };

    fetchGroups();
  }, []);

  if (loading) return <div className={styles.loading}>Cargando grupos...</div>;

  return (
    <div className={styles.groupsContainer}>
      <h3 className={styles.sectionTitle}> Clasificación de Grupos</h3>
      <div className={styles.grid}>
        {groups.map((group) => (
          <div key={group.id} className={styles.groupCard}>
            <div className={styles.groupHeader}>{group.name}</div>
            <ul className={styles.teamList}>
              {group.teams.map((team) => (
                <li key={team.id} className={`${styles.teamItem} ${team.id === userTeamId ? styles.isMyTeam : ""}`}>
                  <div className={styles.teamInfo}>
                    {team.badge_url && (
                      <img src={team.badge_url} alt="Escudo" className={styles.badge} />
                    )}
                    <span>{team.team_name}</span>
                  </div>
                  {team.id === userTeamId && <span className={styles.myBadge}>👤 Tu equipo</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}