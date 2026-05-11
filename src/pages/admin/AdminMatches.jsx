// src/pages/admin/AdminMatches.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Badge } from '../../design-system/components';
import styles from './AdminMatches.module.css';

// ✅ Opciones de fase para el selector
const STAGE_OPTIONS = [
  { value: 'group', label: '📊 Fase de Grupos' },
  { value: 'playoff', label: '🔥 Playoffs' },
  { value: 'semifinal', label: '🥊 Semifinal' },
  { value: 'final', label: '🏆 Final' },
  { value: 'third_place', label: '🥉 3º y 4º' }
];

export default function AdminMatches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMatches();
    
    const channel = supabase
      .channel('admin_matches')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'matches' }, 
        fetchMatches
      )
      .subscribe();
    
    return () => supabase.removeChannel(channel);
  }, []);

  const fetchMatches = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('matches')
      .select(`
        id, match_date, status, court_number, verification_code, stage,
        home:profiles!matches_home_team_id_fkey(team_name),
        away:profiles!matches_away_team_id_fkey(team_name),
        referee:profiles!matches_referee_team_id_fkey(team_name)
      `)
      .order('match_date');
    
    if (data) setMatches(data);
    setLoading(false);
  };

  // ✅ Actualizar fase de un partido
  const updateMatchStage = async (matchId, newStage) => {
    setSaving(true);
    const { error } = await supabase
      .from('matches')
      .update({ stage: newStage })
      .eq('id', matchId);
    
    if (error) {
      console.error('❌ Error al actualizar fase:', error);
      alert('Error al guardar la fase');
    } else {
      // Optimistic update
      setMatches(prev => prev.map(m => 
        m.id === matchId ? { ...m, stage: newStage } : m
      ));
    }
    setSaving(false);
    setEditingId(null);
  };

  const formatDate = (iso) => iso ? new Date(iso).toLocaleString('es-ES') : '-';

  const getStageLabel = (value) => {
    const opt = STAGE_OPTIONS.find(o => o.value === value);
    return opt?.label || 'Fase desconocida';
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>📋 Gestión de Partidos y Códigos</h1>
      
      {loading ? (
        <p>Cargando...</p>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Enfrentamiento</th>
                <th>Pista</th>
                <th>Árbitro</th>
                <th>Código Acceso</th>
                <th>🎯 Fase</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {matches.map(m => (
                <tr key={m.id}>
                  <td>{formatDate(m.match_date)}</td>
                  <td>
                    <strong>{m.home?.team_name}</strong> vs <strong>{m.away?.team_name}</strong>
                  </td>
                  <td>{m.court_number || '-'}</td>
                  <td>
                    {m.referee?.team_name || <span style={{color:'var(--text-muted)'}}>Sin asignar</span>}
                  </td>
                  <td><code className={styles.code}>{m.verification_code}</code></td>
                  
                  {/* ✅ SELECTOR DE FASE */}
                  <td>
                    {editingId === m.id ? (
                      <div className={styles.stageEditor}>
                        <select
                          className={styles.stageSelect}
                          value={m.stage || 'group'}
                          onChange={(e) => updateMatchStage(m.id, e.target.value)}
                          disabled={saving}
                          autoFocus
                        >
                          {STAGE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <button 
                          className={styles.cancelBtn}
                          onClick={() => setEditingId(null)}
                          disabled={saving}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        className={styles.stageBadge}
                        onClick={() => setEditingId(m.id)}
                        title="Click para editar fase"
                      >
                        {getStageLabel(m.stage || 'group')}
                        <span className={styles.editIcon}>✏️</span>
                      </button>
                    )}
                  </td>
                  
                  <td>
                    <Badge variant={
                      m.status === 'live' ? 'live' : 
                      m.status === 'finished' ? 'finished' : 'scheduled'
                    }>
                      {m.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}