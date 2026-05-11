import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Card, Button } from '../../design-system/components';
import { generateBracketMatches, updateFinalsWithSemifinalResults } from '../../lib/bracketUtils';
import { calculateGroupStandings } from '../../lib/tournament/standingsCalculator';
import { schedulePlayoffMatches } from '../../lib/tournament/schedulePlayoffMatches';
import BracketTree from '../../components/BracketTree';
import styles from './PlayoffManager.module.css';

// ============================================
// HELPERS CENTRALIZADOS PARA ESTADOS DE PARTIDOS
// ============================================
const isFinished = (status) => ['finished', 'completed'].includes(status);
const isPlayable = (status) => ['pending', 'scheduled'].includes(status);
const isScheduled = (status) => status === 'scheduled';

// Función auxiliar para generar códigos aleatorios
const generateVerificationCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

export default function PlayoffManager() {
  const [config, setConfig] = useState(null);
  const [standings, setStandings] = useState([]);
  const [bracket, setBracket] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [allGroupsFinished, setAllGroupsFinished] = useState(false);
  const [groupZFinished, setGroupZFinished] = useState(false);
  const [groupWFinished, setGroupWFinished] = useState(false);
  const [groupZStandings, setGroupZStandings] = useState([]);
  const [groupWStandings, setGroupWStandings] = useState([]);
  const [teams, setTeams] = useState([]);
  const [groupZId, setGroupZId] = useState(null);
  const [groupWId, setGroupWId] = useState(null);
  const [logs, setLogs] = useState([]);
  
  // Estado para edición manual de partidos
  const [editingMatch, setEditingMatch] = useState(null);
  const [editForm, setEditForm] = useState({
    home_team_id: null,
    away_team_id: null,
    match_date: '',
    court_number: '',
    referee_team_id: null,
    status: 'pending'
  });
  const [availableCourts] = useState(['1', '2', '3', '4']);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => { 
    fetchData(); 
  }, []);

  // ============================================
  // CORRECCIÓN: useMemo robusto para detectar equipos
  // ============================================
  const playoffQualifiers = useMemo(() => {
    const qualifiers = { z: [], w: [] };
    
    // --- GRUPO Z ---
    if (Array.isArray(groupZStandings) && groupZStandings.length >= 1) {
      const first = groupZStandings[0];
      if (first) {
        const id = first.team_id || first.id || first.teamId;
        const name = first.team_name || first.name || first.teamName || 'Equipo Desconocido';
        if (id) {
          qualifiers.z.push({ id, name, seed: '1º Grupo Z' });
        }
      }
    }
    if (Array.isArray(groupZStandings) && groupZStandings.length >= 2) {
      const second = groupZStandings[1];
      if (second) {
        const id = second.team_id || second.id || second.teamId;
        const name = second.team_name || second.name || second.teamName || 'Equipo Desconocido';
        if (id) {
          qualifiers.z.push({ id, name, seed: '2º Grupo Z' });
        }
      }
    }
    
    // --- GRUPO W ---
    if (Array.isArray(groupWStandings) && groupWStandings.length >= 1) {
      const first = groupWStandings[0];
      if (first) {
        const id = first.team_id || first.id || first.teamId;
        const name = first.team_name || first.name || first.teamName || 'Equipo Desconocido';
        if (id) {
          qualifiers.w.push({ id, name, seed: '1º Grupo W' });
        }
      }
    }
    if (Array.isArray(groupWStandings) && groupWStandings.length >= 2) {
      const second = groupWStandings[1];
      if (second) {
        const id = second.team_id || second.id || second.teamId;
        const name = second.team_name || second.name || second.teamName || 'Equipo Desconocido';
        if (id) {
          qualifiers.w.push({ id, name, seed: '2º Grupo W' });
        }
      }
    }
    
    return qualifiers;
  }, [groupZStandings, groupWStandings]);

  const addLog = (msg) => {
    setLogs(prev => [msg, ...prev].slice(0, 50));
  };

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Configuración del torneo
      const configResponse = await supabase
        .from('tournament_config')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (configResponse.data) setConfig(configResponse.data);
      if (configResponse.error && configResponse.error.code !== 'PGRST116') {
        console.error('Error config:', configResponse.error);
      }

      // 2. Obtener grupos Z y W de playoffs
      const { data: playoffGroups, error: groupsErr } = await supabase
        .from('groups')
        .select('id, name')
        .in('name', ['Grupo Z (Playoffs)', 'Grupo W (Playoffs)']);
      
      if (groupsErr) console.error('Error grupos:', groupsErr);
      const pGroups = playoffGroups || [];
      
      const zGroup = pGroups.find(g => g.name === 'Grupo Z (Playoffs)');
      const wGroup = pGroups.find(g => g.name === 'Grupo W (Playoffs)');
      
      if (zGroup) setGroupZId(zGroup.id);
      if (wGroup) setGroupWId(wGroup.id);

      // 3. Obtener todos los equipos
      const { data: allTeams, error: teamsErr } = await supabase
        .from('profiles')
        .select('id, team_name, is_admin_team');
      
      if (teamsErr) console.error('Error equipos:', teamsErr);
      setTeams(allTeams || []);

      // 4. Grupos y asignaciones (Fase inicial)
      const { data: groups, error: gErr } = await supabase
        .from('groups')
        .select('id, name, draw_order')
        .not('name', 'in', '(Grupo Z (Playoffs),Grupo W (Playoffs))');
      
      if (gErr) console.error('Error fases:', gErr);
      const initialGroups = groups || [];
      
      const { data: assignments, error: aErr } = await supabase
        .from('group_assignments')
        .select('team_id, group_id, profiles(team_name, badge_url)');
      
      if (aErr) console.error('Error asignaciones:', aErr);
      const initialAssignments = assignments || [];
      
      // 5. Partidos de fase de grupos ORIGINAL
      const { data: originalGroupMatches, error: origErr } = await supabase
        .from('matches')
        .select('*')
        .eq('phase', 'group');
      
      if (origErr) console.error('Error partidos grupo:', origErr);
      const oMatches = originalGroupMatches || [];
      
      const allOriginalFinished = oMatches.length > 0 && oMatches.every(m => isFinished(m.status));
      setAllGroupsFinished(allOriginalFinished);

      // 6. Partidos de fase playoffs
      const { data: playoffMatches, error: plErr } = await supabase
        .from('matches')
        .select('*')
        .in('phase', ['playoff_group', 'playoff_final'])
        .order('round', { ascending: true });
      
      if (plErr) console.error('Error partidos playoff:', plErr);
      const pMatches = playoffMatches || [];

      const groupPlayoffMatches = pMatches.filter(m => 
        m.phase === 'playoff_group' && 
        m.round <= 3 && 
        (m.group_id === zGroup?.id || m.group_id === wGroup?.id)
      );
      
      const zMatches = groupPlayoffMatches.filter(m => m.group_id === zGroup?.id);
      const wMatches = groupPlayoffMatches.filter(m => m.group_id === wGroup?.id);
      
      const zFinished = zMatches.length > 0 && zMatches.every(m => isFinished(m.status));
      const wFinished = wMatches.length > 0 && wMatches.every(m => isFinished(m.status));
      
      setGroupZFinished(zFinished);
      setGroupWFinished(wFinished);

      // 7. Calcular standings de grupos Z y W
      if (zMatches.length > 0 && zGroup) {
        const zTeamIds = [...new Set(zMatches.flatMap(m => [m.home_team_id, m.away_team_id]))];
        const zAssignments = zTeamIds.map(id => {
          const team = allTeams.find(t => t.id === id);
          return {
            team_id: id,
            group_id: zGroup.id,
            profiles: { team_name: team?.team_name || 'Equipo' }
          };
        });
        
        const zStandings = calculateGroupStandings(zGroup, zAssignments, zMatches);
        setGroupZStandings(Array.isArray(zStandings) ? zStandings : []);
      }
      
      if (wMatches.length > 0 && wGroup) {
        const wTeamIds = [...new Set(wMatches.flatMap(m => [m.home_team_id, m.away_team_id]))];
        const wAssignments = wTeamIds.map(id => {
          const team = allTeams.find(t => t.id === id);
          return {
            team_id: id,
            group_id: wGroup.id,
            profiles: { team_name: team?.team_name || 'Equipo' }
          };
        });
        
        const wStandings = calculateGroupStandings(wGroup, wAssignments, wMatches);
        setGroupWStandings(Array.isArray(wStandings) ? wStandings : []);
      }

      // 8. Calcular standings de fase de grupos ORIGINAL
      const tempStandings = {};
      initialGroups.forEach(g => { 
        if (g?.id) tempStandings[String(g.id).trim()] = []; 
      });
      
      initialAssignments.forEach(a => {
        if (a?.group_id && a?.team_id && tempStandings[String(a.group_id).trim()]) {
          tempStandings[String(a.group_id).trim()].push({ 
            team_id: a.team_id, 
            team_name: a.profiles?.team_name || 'Equipo',
            w: 0, l: 0, pts: 0, sf: 0, sc: 0, pf: 0, pa: 0
          });
        }
      });

      oMatches.forEach(m => {
        if (!m?.group_id) return;
        const groupId = String(m.group_id).trim();
        if (!tempStandings[groupId]) return;
        
        let homeSets = 0, awaySets = 0, homePoints = 0, awayPoints = 0;
        
        if (m.sets_details) {
          try {
            const sets = typeof m.sets_details === 'string' ? JSON.parse(m.sets_details) : m.sets_details;
            if (Array.isArray(sets)) {
              sets.forEach(set => {
                const h = Array.isArray(set) ? set[0] : set?.home || 0;
                const a = Array.isArray(set) ? set[1] : set?.away || 0;
                homePoints += Number(h) || 0;
                awayPoints += Number(a) || 0;
                if ((Number(h) || 0) > (Number(a) || 0)) homeSets++;
                else if ((Number(a) || 0) > (Number(h) || 0)) awaySets++;
              });
            }
          } catch (e) { console.warn('Error parseando sets_details:', e); }
        }
        
        if (homeSets === 0 && awaySets === 0) {
          homeSets = Number(m.home_score) || 0;
          awaySets = Number(m.away_score) || 0;
          homePoints = homeSets;
          awayPoints = awaySets;
        }

        const homeTeam = tempStandings[groupId].find(t => String(t.team_id) === String(m.home_team_id));
        const awayTeam = tempStandings[groupId].find(t => String(t.team_id) === String(m.away_team_id));
        
        if (homeTeam && awayTeam) {
          homeTeam.sf += homeSets; homeTeam.sc += awaySets; homeTeam.pf += homePoints; homeTeam.pa += awayPoints;
          awayTeam.sf += awaySets; awayTeam.sc += homeSets; awayTeam.pf += awayPoints; awayTeam.pa += homePoints;
          
          if (homeSets > awaySets) {
            homeTeam.w++; homeTeam.pts += 2; awayTeam.l++; awayTeam.pts += 1;
          } else if (awaySets > homeSets) {
            awayTeam.w++; awayTeam.pts += 2; homeTeam.l++; homeTeam.pts += 1;
          } else {
            homeTeam.pts += 1; awayTeam.pts += 1;
          }
        }
      });

      const flatStandings = [];
      Object.entries(tempStandings).forEach(([gid, teamsInGroup]) => {
        teamsInGroup.sort((a, b) => {
          if (b.pts !== a.pts) return b.pts - a.pts;
          if (b.w !== a.w) return b.w - a.w;
          const diffA = (a.sf || 0) - (a.sc || 0);
          const diffB = (b.sf || 0) - (b.sc || 0);
          if (diffB !== diffA) return diffB - diffA;
          return (b.pf || 0) - (a.pf || 0);
        });
        
        teamsInGroup.forEach((t, i) => {
          flatStandings.push({ 
            group_id: gid, team_id: t.team_id, team_name: t.team_name,
            rank: i + 1, pts: t.pts, w: t.w, l: t.l,
            sf: t.sf, sc: t.sc, pf: t.pf, pa: t.pa
          });
        });
      });
      
      setStandings(flatStandings);

      if (pMatches.length > 0) {
        setBracket(pMatches);
      }

    } catch (err) {
      console.error('Error fetching playoff ', err);
      setError('Error cargando datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setError('');
    setLogs([]);
    
    if (!allGroupsFinished) {
      setError('⚠️ Deben finalizar TODOS los partidos de la fase de grupos primero.');
      return;
    }
    
    if (!standings.length) {
      setError('⚠️ No hay clasificados disponibles.');
      return;
    }
    
    if (!confirm('⚠️ Esto REINICIARÁ y generará la fase de playoffs. ¿Continuar?')) return;
    
    setGenerating(true);
    try {
      addLog('🚀 Iniciando...');
      
      // 1. ELIMINAR playoffs existentes
      addLog('🗑️ Eliminando playoffs existentes...');
      await supabase
        .from('matches')
        .delete()
        .in('phase', ['playoff_group', 'playoff_final']);
      
      await supabase
        .from('groups')
        .delete()
        .in('name', ['Grupo Z (Playoffs)', 'Grupo W (Playoffs)']);
      
      // 2. Crear grupos Z y W
      const numGroups = config?.num_groups;
      const teamsAdvancing = config?.teams_advancing || 2;
      
      // ✅ CORRECCIÓN: Desestructuración correcta { data: zGroup }
      const { data: zGroup, error: zErr } = await supabase
        .from('groups')
        .insert({ name: 'Grupo Z (Playoffs)', draw_order: 100 })
        .select('id')
        .single();
      
      if (zErr) throw zErr;
      if (!zGroup?.id) throw new Error('Error creando Grupo Z: No se recibió ID');
      
      // ✅ CORRECCIÓN: Desestructuración correcta { data: wGroup }
      const { data: wGroup, error: wErr } = await supabase
        .from('groups')
        .insert({ name: 'Grupo W (Playoffs)', draw_order: 101 })
        .select('id')
        .single();
      
      if (wErr) throw wErr;
      if (!wGroup?.id) throw new Error('Error creando Grupo W: No se recibió ID');
      
      addLog('✅ Grupos Z y W creados');
      setGroupZId(zGroup.id);
      setGroupWId(wGroup.id);
      
      // 3. Generar bracket completo (Grupos + Semis + Finales)
      addLog(' Generando bracket completo...');
      const generatedMatches = generateBracketMatches(standings, numGroups, teamsAdvancing, zGroup.id, wGroup.id);
      
      // ✅ CORRECCIÓN: Usar SOLO lo que devuelve el generador para evitar duplicados
      const allMatches = generatedMatches;
      
      if (!allMatches || allMatches.length === 0) {
        throw new Error('No se generaron partidos');
      }

      // ✅ Generar ID manualmente para cada partido antes de insertar
      const matchesWithIds = allMatches.map(match => ({
        ...match,
        id: crypto.randomUUID() 
      }));
      
      addLog(`✅ ${matchesWithIds.length} partidos generados con IDs`);
      
      // 4. Insertar en BD
      // ✅ CORRECCIÓN: Desestructuración correcta { data: inserted }
      const { data: inserted, error: insertErr } = await supabase
        .from('matches')
        .insert(matchesWithIds)
        .select();
      
      if (insertErr) throw insertErr;
      if (!inserted || !Array.isArray(inserted)) {
        throw new Error('Supabase no devolvió partidos insertados correctamente');
      }
      
      addLog('✅ Partidos guardados');
      setBracket(inserted);
      
      // 5. PROGRAMAR horarios SOLO para partidos de grupos Z/W
      addLog('📅 Programando horarios de grupos Z/W...');
      const { data: originalMatches } = await supabase.from('matches').select('*').eq('phase', 'group');
      const oMatches = originalMatches || [];
      const groupPlayoffInserted = inserted.filter(m => m.phase === 'playoff_group');
      
      if (groupPlayoffInserted.length > 0) {
        const scheduled = await schedulePlayoffMatches(groupPlayoffInserted, oMatches, teams, config, addLog);
        if (scheduled && scheduled.length > 0) {
          addLog(`🔄 Actualizando ${scheduled.length} partidos de grupos...`);
          for (const sched of scheduled) {
            if (sched?.id) {
              const { error: updateErr } = await supabase
                .from('matches')
                .update({ match_date: sched.match_date, court_number: sched.court_number, referee_team_id: sched.referee_team_id, status: 'scheduled' })
                .eq('id', sched.id);
              if (updateErr) console.error('Error actualizando partido:', updateErr);
            }
          }
          addLog('✅ Horarios de grupos programados');
        }
      }

      // 6. Generar códigos de acceso para semifinales y finales
      addLog(' Generando códigos de acceso para organizadores...');
      const finalMatchesInserted = inserted.filter(m => m.phase === 'playoff_final');
      
      for (const match of finalMatchesInserted) {
        if (match?.id) {
          const code = generateVerificationCode();
          
          const { error: updateCodeErr } = await supabase
            .from('matches')
            .update({ verification_code: code })
            .eq('id', match.id);
          
          if (updateCodeErr) console.error('Error asignando código:', updateCodeErr);
          else addLog(`✅ Ronda ${match.round}: Código ${code}`);
        }
      }

      addLog('✅ Playoffs generados exitosamente.');
      alert('✅ Playoffs generados.');
      await fetchData();
      
    } catch (err) {
      console.error('❌ Error:', err);
      setError(err.message);
      addLog('❌ ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const openEditModal = (match) => {
    if (!match) {
      console.error('openEditModal: match es null/undefined');
      return;
    }
    
    setEditingMatch(match);
    setEditForm({
      home_team_id: match.home_team_id || '',
      away_team_id: match.away_team_id || '',
      match_date: match.match_date ? new Date(match.match_date).toISOString().slice(0, 16) : '',
      court_number: match.court_number || '',
      referee_team_id: match.referee_team_id || '',
      status: match.status || 'pending'
    });
    
    setTimeout(() => {
      console.log('🔐 setIsModalOpen: true');
      setIsModalOpen(true);
    }, 0);
  };

  const handleSaveMatch = async () => {
    if (!editingMatch || !editingMatch.id) {
      alert('❌ Error: No hay partido seleccionado');
      return;
    }
    
    setGenerating(true);
    try {
      const newStatus = editForm.home_team_id && editForm.away_team_id ? 'scheduled' : 'pending';
      
      const { error: updateErr } = await supabase
        .from('matches')
        .update({
          home_team_id: editForm.home_team_id || null,
          away_team_id: editForm.away_team_id || null,
          match_date: editForm.match_date || null,
          court_number: editForm.court_number || null,
          referee_team_id: editForm.referee_team_id || null,
          status: newStatus
        })
        .eq('id', editingMatch.id);
      
      if (updateErr) throw updateErr;
      addLog(`✅ Partido Ronda ${editingMatch.round} actualizado`);
      alert('✅ Partido guardado correctamente');
      setIsModalOpen(false);
      setEditingMatch(null);
      await fetchData();
    } catch (err) {
      console.error('Error guardando partido:', err);
      setError(err.message);
      alert('❌ Error: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const getTeamName = (teamId) => {
    if (!teamId) return 'Por definir';
    const team = teams.find(t => t && t.id === teamId);
    return team?.team_name || 'Equipo';
  };

  const getQualifierLabel = (teamId) => {
    if (!teamId || !playoffQualifiers) return '';
    
    const allQualifiers = [...(playoffQualifiers.z || []), ...(playoffQualifiers.w || [])];
    const qualifier = allQualifiers.find(q => q && q.id === teamId);
    
    return qualifier ? qualifier.seed : '';
  };

  const handleReset = async () => {
    if (!confirm('¿Eliminar TODOS los partidos de playoffs?')) return;
    setLoading(true);
    try {
      const { error: deleteMatchesErr } = await supabase.from('matches').delete().in('phase', ['playoff_group', 'playoff_final']);
      if (deleteMatchesErr) throw deleteMatchesErr;
      if (groupZId) await supabase.from('groups').delete().eq('id', groupZId);
      if (groupWId) await supabase.from('groups').delete().eq('id', groupWId);
      
      setBracket([]); setGroupZStandings([]); setGroupWStandings([]);
      setGroupZId(null); setGroupWId(null); setLogs([]);
      alert('✅ Playoffs reiniciados');
      await fetchData();
    } catch (err) {
      console.error('Error reseteando:', err);
      setError('Error al reiniciar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Cargando datos...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>🏆 Fase Eliminatoria</h1>
        <div className={styles.actions}>
          {!bracket.length ? (
            <Button variant="primary" onClick={handleGenerate} loading={generating} disabled={!allGroupsFinished || generating}>
              🌳 Generar Playoffs
            </Button>
          ) : (
            <Button variant="danger" onClick={handleReset} disabled={generating}>🗑️ Reiniciar</Button>
          )}
          <Button variant="ghost" onClick={fetchData}>🔄 Actualizar</Button>
        </div>
      </header>

      {error && (
        <div className={styles.error}>
          <strong>⚠️ Error:</strong> {error}
          <button className={styles.closeError} onClick={() => setError('')}>×</button>
        </div>
      )}
      
      {!allGroupsFinished && !bracket.length && (
        <Card className={styles.warningCard}>
          <h3>⏳ Fase de Grupos en curso</h3>
          <p>El bracket se generará cuando finalicen todos los partidos de grupo.</p>
        </Card>
      )}
      
      {bracket.length === 0 && allGroupsFinished && (
        <Card className={styles.emptyCard}>
          <h3>✅ Listo para generar</h3>
          <p>Pulsa "Generar Playoffs" para crear la fase eliminatoria.</p>
        </Card>
      )}

      {bracket.length > 0 && (
        <div className={styles.content}>
          {logs.length > 0 && (
            <Card className={styles.logsCard}>
              <h3>📜 Registro</h3>
              <div className={styles.logsContainer}>
                {logs.map((log, i) => <p key={i} className={styles.logEntry}>{log}</p>)}
              </div>
            </Card>
          )}

          {(groupZStandings.length > 0 || groupWStandings.length > 0) && (
            <Card className={styles.qualifiersCard}>
              <h3> Clasificados para Playoffs</h3>
              <div className={styles.qualifiersGrid}>
                <div className={styles.qualifierGroup}>
                  <h4>🔵 Grupo Z</h4>
                  <ol className={styles.qualifierList}>
                    {groupZStandings.slice(0, 2).map((team, idx) => (
                      <li key={team?.team_id || idx} className={styles.qualifierItem}>
                        <span className={styles.seedBadge}>{idx + 1}º</span>
                        <span className={styles.teamName}>{team?.team_name || team?.name || 'Equipo'}</span>
                      </li>
                    ))}
                    {groupZStandings.length === 0 && <li>Sin clasificados aún</li>}
                  </ol>
                </div>
                <div className={styles.qualifierGroup}>
                  <h4>🔴 Grupo W</h4>
                  <ol className={styles.qualifierList}>
                    {groupWStandings.slice(0, 2).map((team, idx) => (
                      <li key={team?.team_id || idx} className={styles.qualifierItem}>
                        <span className={styles.seedBadge}>{idx + 1}º</span>
                        <span className={styles.teamName}>{team?.team_name || team?.name || 'Equipo'}</span>
                      </li>
                    ))}
                    {groupWStandings.length === 0 && <li>Sin clasificados aún</li>}
                  </ol>
                </div>
              </div>
              <p className={styles.qualifierHint}>💡 Usa estos equipos para configurar las semifinales manualmente</p>
            </Card>
          )}

          <div className={styles.standingsSection}>
            <h2>📊 Clasificación Fase Playoffs</h2>
            <div className={styles.standingsGrid}>
              <Card className={styles.standingsCard}>
                <h3>🔵 Grupo Z</h3>
                <table className={styles.standingsTable}>
                  <thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>G</th><th>P</th><th>PTS</th></tr></thead>
                  <tbody>
                    {groupZStandings.map((team, idx) => (
                      <tr key={team?.id || idx} className={idx < 2 ? styles.qualifying : ''}>
                        <td>{idx + 1}</td><td>{team?.team_name || team?.name || 'Equipo'}</td><td>{team?.pj || 0}</td><td>{team?.g || 0}</td><td>{team?.p || 0}</td><td><strong>{team?.pts || 0}</strong></td>
                      </tr>
                    ))}
                    {groupZStandings.length === 0 && <tr><td colSpan="6">Sin partidos jugados</td></tr>}
                  </tbody>
                </table>
                {groupZFinished && <div className={styles.qualifyingNote}>✅ Clasificados: {groupZStandings[0]?.team_name || groupZStandings[0]?.name || '-'} (1º), {groupZStandings[1]?.team_name || groupZStandings[1]?.name || '-'} (2º)</div>}
              </Card>
              <Card className={styles.standingsCard}>
                <h3>🔴 Grupo W</h3>
                <table className={styles.standingsTable}>
                  <thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>G</th><th>P</th><th>PTS</th></tr></thead>
                  <tbody>
                    {groupWStandings.map((team, idx) => (
                      <tr key={team?.id || idx} className={idx < 2 ? styles.qualifying : ''}>
                        <td>{idx + 1}</td><td>{team?.team_name || team?.name || 'Equipo'}</td><td>{team?.pj || 0}</td><td>{team?.g || 0}</td><td>{team?.p || 0}</td><td><strong>{team?.pts || 0}</strong></td>
                      </tr>
                    ))}
                    {groupWStandings.length === 0 && <tr><td colSpan="6">Sin partidos jugados</td></tr>}
                  </tbody>
                </table>
                {groupWFinished && <div className={styles.qualifyingNote}>✅ Clasificados: {groupWStandings[0]?.team_name || groupWStandings[0]?.name || '-'} (1º), {groupWStandings[1]?.team_name || groupWStandings[1]?.name || '-'} (2º)</div>}
              </Card>
            </div>
          </div>

          <div className={styles.bracketWrapper}>
            <div className={styles.bracketHeader}>
              <h3>🌳 Cuadro Eliminatorio</h3>
              <small>Grupos Z/W (R1-3) → Semis (R4) → Final (R5)</small>
            </div>
            <div className={styles.groupStatus}>
              <div className={`${styles.statusBadge} ${groupZFinished ? styles.done : styles.pending}`}>Z: {groupZFinished ? '✅ Finalizado' : '⏳ En curso'}</div>
              <div className={`${styles.statusBadge} ${groupWFinished ? styles.done : styles.pending}`}>W: {groupWFinished ? '✅ Finalizado' : '⏳ En curso'}</div>
            </div>
            <BracketTree matches={bracket} teams={teams} onEditMatch={openEditModal} showEditButton={true} />
          </div>
        </div>
      )}

      {/* MODAL CON SELECTS CORREGIDOS PARA MOSTRAR EQUIPOS */}
      {isModalOpen && editingMatch && (
        <div 
          className={styles.modalOverlay} 
          onClick={() => {
            setIsModalOpen(false);
          }}
        >
          <div 
            className={styles.modalDialog} 
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3>️ Configurar: Ronda {editingMatch?.round || '?'}</h3>
              <button className={styles.closeModal} onClick={() => setIsModalOpen(false)}>×</button>
            </div>
            
            <div className={styles.modalContent}>
              <div style={{ 
                background: '#fef3c7', 
                padding: '0.75rem', 
                borderRadius: '6px', 
                marginBottom: '1rem',
                fontSize: '0.85rem',
                color: '#92400e'
              }}>
                <strong> Debug:</strong> 
                Grupo Z: {playoffQualifiers?.z?.length || 0} equipos, 
                Grupo W: {playoffQualifiers?.w?.length || 0} equipos
              </div>

              <div className={styles.formGroup}>
                <label>🏠 Equipo Local</label>
                <select 
                  className={styles.formSelect} 
                  value={editForm.home_team_id || ''} 
                  onChange={(e) => setEditForm(p => ({ ...p, home_team_id: e.target.value || null }))}
                >
                  <option value="">-- Por definir --</option>
                  {[...(playoffQualifiers?.z || []), ...(playoffQualifiers?.w || [])]
                    .filter(q => q?.id)
                    .map(q => (
                      <option key={`local-${q.id}`} value={q.id}>
                        {q.seed} - {q.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>✈️ Equipo Visitante</label>
                <select 
                  className={styles.formSelect} 
                  value={editForm.away_team_id || ''} 
                  onChange={(e) => setEditForm(p => ({ ...p, away_team_id: e.target.value || null }))}
                >
                  <option value="">-- Por definir --</option>
                  {[...(playoffQualifiers?.z || []), ...(playoffQualifiers?.w || [])]
                    .filter(q => q?.id && q.id !== editForm.home_team_id)
                    .map(q => (
                      <option key={`visitante-${q.id}`} value={q.id}>
                        {q.seed} - {q.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label> Fecha y Hora</label>
                <input 
                  type="datetime-local" 
                  className={styles.formInput} 
                  value={editForm.match_date} 
                  onChange={(e) => setEditForm(p => ({ ...p, match_date: e.target.value }))} 
                />
              </div>

              <div className={styles.formGroup}>
                <label>🏟️ Pista</label>
                <select 
                  className={styles.formSelect} 
                  value={editForm.court_number || ''} 
                  onChange={(e) => setEditForm(p => ({ ...p, court_number: e.target.value || null }))}
                >
                  <option value="">-- Sin asignar --</option>
                  {availableCourts.map(c => (
                    <option key={c} value={c}>Pista {c}</option>
                  ))}
                </select>
              </div>

              <div className={styles.modalActions}>
                <Button variant="ghost" onClick={() => { setIsModalOpen(false); setEditingMatch(null); }} disabled={generating}>
                  Cancelar
                </Button>
                <Button variant="primary" onClick={handleSaveMatch} loading={generating} disabled={!editForm.home_team_id || !editForm.away_team_id}>
                  💾 Guardar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}