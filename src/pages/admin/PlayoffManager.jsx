// src/pages/admin/PlayoffManager.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Card, Button } from '../../design-system/components';
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
  const [allGroupsFinished, setAllGroupsFinished] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Configuración
      const {  cfg, error: cfgErr } = await supabase
        .from('tournament_config')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (cfgErr) throw cfgErr;
      setConfig(cfg);

      // 2. Grupos y asignaciones
      const { data: groups } = await supabase.from('groups').select('id, name, draw_order');
      const { data: assignments } = await supabase.from('group_assignments').select('team_id, group_id');
      
      // 3. Partidos de grupo
      const { data: matches } = await supabase.from('matches').select('*').eq('phase', 'group');
      const groupMatches = matches || [];

      // ✅ VALIDACIÓN CRÍTICA: ¿Todos terminaron?
      const allFinished = groupMatches.length > 0 && !groupMatches.some(m => m.status !== 'finished');
      setAllGroupsFinished(allFinished);

      // Calcular standings reales
      const tempStandings = {};
      groups?.forEach(g => tempStandings[g.id] = []);
      assignments?.forEach(a => {
        if (tempStandings[a.group_id]) tempStandings[a.group_id].push({ team_id: a.team_id, w: 0, l: 0, pts: 0 });
      });

      groupMatches.forEach(m => {
        if (!tempStandings[m.group_id]) return;
        if (m.home_score > m.away_score) {
          const h = tempStandings[m.group_id].find(t => t.team_id === m.home_team_id);
          if (h) { h.w++; h.pts += 2; }
          const a = tempStandings[m.group_id].find(t => t.team_id === m.away_team_id);
          if (a) a.l++;
        } else if (m.away_score > m.home_score) {
          const a = tempStandings[m.group_id].find(t => t.team_id === m.away_team_id);
          if (a) { a.w++; a.pts += 2; }
          const h = tempStandings[m.group_id].find(t => t.team_id === m.home_team_id);
          if (h) h.l++;
        }
      });

      const flatStandings = [];
      Object.entries(tempStandings).forEach(([gid, teams]) => {
        teams.sort((a, b) => b.pts - a.pts || b.w - a.l);
        teams.forEach((t, i) => flatStandings.push({ group_id: parseInt(gid), team_id: t.team_id, rank: i + 1, pts: t.pts, w: t.w, l: t.l }));
      });
      setStandings(flatStandings);

      // 4. Cargar bracket existente si lo hay
      const {  existing } = await supabase.from('matches').select('*').eq('phase', 'playoff').order('round', { ascending: true });
      if (existing?.length) setBracket(existing);

    } catch (err) {
      console.error('Error fetching playoff data:', err);
      setError('Error cargando datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setError('');
    if (!allGroupsFinished) {
      setError('⚠️ Deben finalizar TODOS los partidos de la fase de grupos primero.');
      return;
    }
    if (!confirm('⚠️ Esto generará la fase eliminatoria. ¿Continuar?')) return;
    
    setGenerating(true);
    try {
      if (!config?.num_groups || !config?.teams_advancing) throw new Error("Configuración de grupos incompleta.");
      
      const matches = generateBracketMatches(standings, config.num_groups, config.teams_advancing);
      const { error: insertErr } = await supabase.from('matches').insert(matches);
      if (insertErr) throw insertErr;
      
      setBracket(matches);
      alert('✅ Bracket generado correctamente');
    } catch (err) {
      console.error(err);
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
        <div className={styles.actions}>
          {!bracket.length && (
            <Button 
              variant="primary" 
              onClick={handleGenerate} 
              loading={generating} 
              disabled={!allGroupsFinished || generating}
              title={!allGroupsFinished ? "Espera a que finalicen todos los partidos de grupo" : ""}
            >
              🌳 Generar Playoffs
            </Button>
          )}
          <Button variant="ghost" onClick={fetchData}>🔄 Actualizar</Button>
        </div>
      </header>

      {error && <div className={styles.error}>⚠️ {error}</div>}
      
      {!allGroupsFinished && !bracket.length && (
        <Card className={styles.warningCard}>
          <h3>⏳ Fase de Grupos en curso</h3>
          <p>El bracket se generará automáticamente cuando todos los partidos de grupo estén finalizados.</p>
          <div className={styles.progressInfo}>
            Finalizados: {standings.reduce((sum, s) => sum + (s.w || 0), 0)} / {bracket.length > 0 ? 'N/A' : 'Esperando'}
          </div>
        </Card>
      )}

      {bracket.length === 0 && allGroupsFinished ? (
        <Card className={styles.emptyCard}>
          <h3>📋 Listo para generar</h3>
          <p>Todos los partidos de grupo han finalizado. Pulsa "Generar Playoffs" para crear el cuadro.</p>
        </Card>
      ) : (
        <div className={styles.bracketWrapper}>
          <BracketTree matches={bracket} />
        </div>
      )}
    </div>
  );
}