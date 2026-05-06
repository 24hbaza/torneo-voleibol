// src/pages/StandingsView.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useStandings } from '../features/standings/hooks/useStandings';
import { calculateGroupStandings } from '../features/standings/utils/calculateStandings';
import GroupStandings from '../features/standings/components/GroupStandings';
import styles from './StandingsView.module.css';

export default function StandingsView() {
  const { groups, assignments, matches, loading, error } = useStandings();
  const [advancingCount, setAdvancingCount] = useState(2); // Valor por defecto

  // ✅ Obtener configuración de clasificación
  useEffect(() => {
    const fetchConfig = async () => {
      const { data, error: cfgError } = await supabase
        .from('tournament_config')
        .select('teams_advancing')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (!cfgError && data?.teams_advancing) {
        setAdvancingCount(data.teams_advancing);
      }
    };
    fetchConfig();
  }, []);

  if (loading) return <div className={styles.loading}>Calculando clasificaciones...</div>;
  if (error) return <div className={styles.error}>⚠️ Error cargando datos: {error}</div>;
  if (!groups.length) return <div className={styles.empty}>📋 No hay grupos configurados aún.</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>🏆 Clasificación Oficial</h1>
        <p className={styles.subtitle}>
          Top {advancingCount} por grupo clasifican a la siguiente fase
        </p>
      </header>

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