// src/pages/admin/PlayoffManager.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Card, Button, Badge } from '../../design-system/components';
import { generateBracketMatches } from '../../lib/bracketUtils';
import BracketTree from '../../components/BracketTree';
import styles from './PlayoffManager.module.css';

export default function PlayoffManager() {
  const [config, setConfig] = useState(null);
  const [standings, setStandings] = useState([]);
  const [bracket, setBracket] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const {  cfg } = await supabase.from('tournament_config').select('*').order('created_at', { ascending: false }).limit(1).single();
      setConfig(cfg);

      // Calcular clasificación real para obtener clasificados
      const {  groups } = await supabase.from('groups').select('id, name, draw_order');
      const {  assignments } = await supabase.from('group_assignments').select('*');
      const {  matches } = await supabase.from('matches').select('*').eq('phase', 'group').eq('status', 'finished');
      
      // Calcular standings simples
      const tempStandings = {};
      groups?.forEach(g => tempStandings[g.id] = []);
      assignments?.forEach(a => {
        if (tempStandings[a.group_id]) {
          tempStandings[a.group_id].push({ team_id: a.team_id, w: 0, l: 0, pts: 0 });
        }
      });
      matches?.forEach(m => {
        if (m.home_score > m.away_score) {
          if (tempStandings[m.group_id]) {
            const h = tempStandings[m.group_id].find(t => t.team_id === m.home_team_id);
            if (h) { h.w++; h.pts += 2; }
            const a = tempStandings[m.group_id].find(t => t.team_id === m.away_team_id);
            if (a) a.l++;
          }
        } else if (m.away_score > m.home_score) {
          if (tempStandings[m.group_id]) {
            const a = tempStandings[m.group_id].find(t => t.team_id === m.away_team_id);
            if (a) { a.w++; a.pts += 2; }
            const h = tempStandings[m.group_id].find(t => t.team_id === m.home_team_id);
            if (h) h.l++;
          }
        }
      });

      const flatStandings = [];
      Object.entries(tempStandings).forEach(([gid, teams]) => {
        teams.sort((a, b) => b.pts - a.pts || b.w - a.w);
        teams.forEach((t, i) => flatStandings.push({ group_id: parseInt(gid), team_id: t.team_id, rank: i + 1, pts: t.pts }));
      });
      setStandings(flatStandings);

      // Cargar bracket si existe
      const {  existing } = await supabase.from('matches').select('*').eq('phase', 'playoff').order('round', { ascending: true });
      if (existing?.length) setBracket(existing);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleGenerate = async () => {
    setError('');
    if (!confirm('⚠️ Esto generará la fase eliminatoria. ¿Continuar?')) return;
    setGenerating(true);
    try {
      const matches = generateBracketMatches(standings, config.num_groups, config.teams_advancing);
      const { error: err } = await supabase.from('matches').insert(matches);
      if (err) throw err;
      setBracket(matches);
      alert('✅ Bracket generado correctamente');
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className={styles.loading}>Cargando datos...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>🏆 Fase Eliminatoria</h1>
        {config?.draw_completed && !bracket.length && (
          <Button variant="primary" onClick={handleGenerate} loading={generating} disabled={generating}>
            🌳 Generar Playoffs
          </Button>
        )}
      </header>

      {error && <div className={styles.error}>⚠️ {error}</div>}

      {!bracket.length ? (
        <Card className={styles.emptyCard}>
          <h3>📋 Esperando generación</h3>
          <p>Completa la fase de grupos y pulsa "Generar Playoffs" para crear el cuadro automático.</p>
        </Card>
      ) : (
        <div className={styles.bracketWrapper}>
          <BracketTree matches={bracket} />
        </div>
      )}
    </div>
  );
}