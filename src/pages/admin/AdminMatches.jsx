// src/pages/admin/AdminMatches.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Badge } from '../../design-system/components';
import styles from './AdminMatches.module.css';

export default function AdminMatches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const response = await supabase
        .from('matches')
        .select(`
          id, match_date, status, court_number, verification_code,
          home:profiles!matches_home_team_id_fkey(team_name),
          away:profiles!matches_away_team_id_fkey(team_name),
          referee:profiles!matches_referee_team_id_fkey(team_name)
        `)
        .order('match_date');
      if (response.data) setMatches(response.data);
      setLoading(false);
    };
    fetch();
    const channel = supabase.channel('admin_matches').on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, fetch).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const formatDate = (iso) => iso ? new Date(iso).toLocaleString('es-ES') : '-';

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>📋 Gestión de Partidos y Códigos</h1>
      {loading ? <p>Cargando...</p> : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Enfrentamiento</th>
                <th>Pista</th>
                <th>Árbitro</th>
                <th>Código Acceso</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {matches.map(m => (
                <tr key={m.id}>
                  <td>{formatDate(m.match_date)}</td>
                  <td><strong>{m.home?.team_name}</strong> vs <strong>{m.away?.team_name}</strong></td>
                  <td>{m.court_number || '-'}</td>
                  <td>{m.referee?.team_name || <span style={{color:'var(--text-muted)'}}>Sin asignar</span>}</td>
                  <td><code className={styles.code}>{m.verification_code}</code></td>
                  <td><Badge variant={m.status==='live'?'live':m.status==='finished'?'finished':'scheduled'}>{m.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}