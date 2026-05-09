import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useStandings } from '../features/standings/hooks/useStandings';
import { calculateGroupStandings } from '../features/standings/utils/calculateStandings';
import GroupStandings from '../features/standings/components/GroupStandings';
import styles from './StandingsView.module.css';

export default function StandingsView() {
  const { groups, assignments, matches, loading, error } = useStandings();
  const [advancingCount, setAdvancingCount] = useState(2);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { data, error: cfgError } = await supabase
          .from('tournament_config')
          .select('teams_advancing')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!cfgError && data?.teams_advancing) {
          setAdvancingCount(data.teams_advancing);
        }
      } catch (err) {
        console.warn('Config no encontrada, usando default');
      }
    };
    fetchConfig();
  }, []);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Cargando clasificación...</p>
      </div>
    );
  }

  if (error) {
    return <div className={styles.error}>⚠️ Error: {error}</div>;
  }

  if (!groups?.length) {
    return <div className={styles.empty}>📋 No hay grupos configurados aún.</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        {groups.map(group => {
          const standings = calculateGroupStandings(group, assignments, matches);
          return (
            <GroupStandings
              key={group.id}
              group={group}
              standings={standings}
              advancingCount={advancingCount}
            />
          );
        })}
      </div>
    </div>
  );
}