// src/pages/admin/AdminMVPLeaderboard.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Card, Badge } from '../../design-system/components';
import styles from './AdminMVPLeaderboard.module.css';

export default function AdminMVPLeaderboard() {
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState({ male: [], female: [] });
  const [season, setSeason] = useState('2026');

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      // Obtener todos los partidos finalizados con MVPs votados
      const { data: matches, error } = await supabase
        .from('matches')
        .select(`
          id, mvp_male_name, mvp_male_photo_url, mvp_female_name, mvp_female_photo_url,
          mvp_male_voted, mvp_female_voted,
          home:profiles!matches_home_team_id_fkey(team_name),
          away:profiles!matches_away_team_id_fkey(team_name)
        `)
        .eq('status', 'finished');

      if (error) throw error;

      // Contar MVPs por jugador
      const maleCounts = {};
      const femaleCounts = {};

      matches?.forEach(match => {
        if (match.mvp_male_voted && match.mvp_male_name) {
          const key = `${match.mvp_male_name}_${match.mvp_male_photo_url}`;
          if (!maleCounts[key]) {
            maleCounts[key] = {
              name: match.mvp_male_name,
              photo_url: match.mvp_male_photo_url,
              count: 0,
              teams: new Set()
            };
          }
          maleCounts[key].count++;
          if (match.home?.team_name) maleCounts[key].teams.add(match.home.team_name);
          if (match.away?.team_name) maleCounts[key].teams.add(match.away.team_name);
        }
        if (match.mvp_female_voted && match.mvp_female_name) {
          const key = `${match.mvp_female_name}_${match.mvp_female_photo_url}`;
          if (!femaleCounts[key]) {
            femaleCounts[key] = {
              name: match.mvp_female_name,
              photo_url: match.mvp_female_photo_url,
              count: 0,
              teams: new Set()
            };
          }
          femaleCounts[key].count++;
          if (match.home?.team_name) femaleCounts[key].teams.add(match.home.team_name);
          if (match.away?.team_name) femaleCounts[key].teams.add(match.away.team_name);
        }
      });

      // Convertir a arrays y ordenar
      const maleList = Object.values(maleCounts)
        .map(p => ({ ...p, teams: Array.from(p.teams) }))
        .sort((a, b) => b.count - a.count);
      
      const femaleList = Object.values(femaleCounts)
        .map(p => ({ ...p, teams: Array.from(p.teams) }))
        .sort((a, b) => b.count - a.count);

      setLeaderboard({ male: maleList, female: femaleList });
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Género', 'Jugador', 'MVPs', 'Equipos', 'Foto'];
    const rows = [];
    
    leaderboard.male.forEach(p => {
      rows.push(['Masculino', p.name, p.count, p.teams.join(', '), p.photo_url]);
    });
    leaderboard.female.forEach(p => {
      rows.push(['Femenino', p.name, p.count, p.teams.join(', '), p.photo_url]);
    });

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mvp-leaderboard-${season}.csv`;
    a.click();
  };

  if (loading) return <div className={styles.loading}>Cargando clasificación MVP...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>🏆 Clasificación de MVPs</h1>
        <div className={styles.actions}>
          <select 
            value={season} 
            onChange={(e) => setSeason(e.target.value)}
            className={styles.seasonSelect}
          >
            <option value="2026">Temporada 2026</option>
            <option value="2025">Temporada 2025</option>
          </select>
          <button onClick={exportCSV} className={styles.exportBtn}>
            📥 Exportar CSV
          </button>
        </div>
      </header>

      <div className={styles.grid}>
        {/* MVP Masculino */}
        <Card title="👨 MVP Masculino">
          {leaderboard.male.length === 0 ? (
            <p className={styles.empty}>Aún no hay MVPs masculinos votados.</p>
          ) : (
            <div className={styles.leaderboardList}>
              {leaderboard.male.map((player, index) => (
                <div key={index} className={`${styles.leaderboardItem} ${index < 3 ? styles.podium : ''}`}>
                  <span className={styles.rank}>{index + 1}º</span>
                  {player.photo_url && (
                    <img src={player.photo_url} alt={player.name} className={styles.playerPhoto} />
                  )}
                  <div className={styles.playerInfo}>
                    <span className={styles.playerName}>{player.name}</span>
                    <span className={styles.playerTeams}>{player.teams.join(', ')}</span>
                  </div>
                  <Badge variant="gold" size="lg">{player.count} MVPs</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* MVP Femenino */}
        <Card title="👩 MVP Femenino">
          {leaderboard.female.length === 0 ? (
            <p className={styles.empty}>Aún no hay MVPs femeninos votados.</p>
          ) : (
            <div className={styles.leaderboardList}>
              {leaderboard.female.map((player, index) => (
                <div key={index} className={`${styles.leaderboardItem} ${index < 3 ? styles.podium : ''}`}>
                  <span className={styles.rank}>{index + 1}º</span>
                  {player.photo_url && (
                    <img src={player.photo_url} alt={player.name} className={styles.playerPhoto} />
                  )}
                  <div className={styles.playerInfo}>
                    <span className={styles.playerName}>{player.name}</span>
                    <span className={styles.playerTeams}>{player.teams.join(', ')}</span>
                  </div>
                  <Badge variant="gold" size="lg">{player.count} MVPs</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className={styles.footer}>
        <p className={styles.hint}>
          💡 Esta clasificación se actualiza automáticamente cuando los árbitros votan los MVPs.
          Usa el botón "Exportar CSV" para generar el listado de premiados al final del torneo.
        </p>
      </div>
    </div>
  );
}