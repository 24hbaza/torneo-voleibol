// src/pages/admin/ManualGroupAssignment.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Button, Card } from '../../design-system/components';
import { scheduleMatchesPreview } from '../../lib/tournament/previewScheduler';
import { 
  saveDraftMatches, 
  loadDraftMatches, 
  updateDraftMatch, 
  confirmDraft, 
  hasDraft, 
  hasConfirmedDraft,
  clearDraft 
} from '../../lib/tournament/draftStorage';
import styles from './ManualGroupAssignment.module.css';

export default function ManualGroupAssignment() {
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [teams, setTeams] = useState([]);
  const [groups, setGroups] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState([]);
  const initialized = useRef(false);
  
  // Estados para el calendario fantasma (draft)
  const [draftMatches, setDraftMatches] = useState([]);
  const [showDraftPreview, setShowDraftPreview] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [allTeamsList, setAllTeamsList] = useState([]);
  const [isDraftConfirmed, setIsDraftConfirmed] = useState(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      fetchData();
    }
  }, []);

  const addLog = (msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString('es-ES')}] ${msg}`, ...prev].slice(0, 50));
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: configData, error: configError } = await supabase
        .from('tournament_config')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (configError) throw configError;

      if (!configData) {
        addLog('⚠️ No hay configuración. Ve a Configuración primero.');
        setLoading(false);
        return;
      }
      
      setConfig(configData);
      addLog(`✅ Configuración cargada: ${configData.num_groups} grupos`);

      const { data: teamsData, error: teamsError } = await supabase
        .from('profiles')
        .select('id, team_name, badge_url, is_admin_team, availability')
        .eq('status', 'accepted')
        .order('team_name');
      
      if (teamsError) throw teamsError;

      const cleanTeams = teamsData || [];
      setTeams(cleanTeams);
      setAllTeamsList(cleanTeams);
      addLog(`✅ ${cleanTeams.length} equipos cargados`);

      const { data: existingGroups, error: groupsError } = await supabase
        .from('groups')
        .select('*')
        .order('draw_order');
      
      if (groupsError) throw groupsError;

      if (existingGroups && existingGroups.length > 0) {
        const uniqueGroupsMap = new Map();
        existingGroups.forEach(g => uniqueGroupsMap.set(g.id, g));
        const uniqueGroups = Array.from(uniqueGroupsMap.values());
        
        setGroups(uniqueGroups);
        addLog(`✅ Grupos cargados de la BD: ${uniqueGroups.length}`);
        
        const { data: existingAssignments, error: assignError } = await supabase
          .from('group_assignments')
          .select('group_id, team_id');
        
        if (assignError) throw assignError;
        
        const assignMap = {};
        uniqueGroups.forEach(g => { assignMap[g.id] = []; });

        if (existingAssignments) {
          existingAssignments.forEach(a => {
            if (assignMap[a.group_id] && !assignMap[a.group_id].includes(a.team_id)) {
              assignMap[a.group_id].push(a.team_id);
            }
          });
        }
        setAssignments(assignMap);
      } else {
        await createGroups(configData);
      }

      // ✅ Cargar draft existente si hay
      const existingDraft = loadDraftMatches();
      if (existingDraft) {
        setDraftMatches(existingDraft.matches);
        setShowDraftPreview(true); // ✅ Mostrar automáticamente si hay draft
        setIsDraftConfirmed(hasConfirmedDraft());
        addLog(`📝 Draft encontrado: ${existingDraft.matches.length} partidos ${hasConfirmedDraft() ? '(CONFIRMADO)' : '(pendiente)'}`);
      }

    } catch (err) {
      console.error('Error fetching data:', err);
      addLog('❌ Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const createGroups = async (configData) => {
    if (!configData) return;
    
    try {
      addLog('📂 Creando grupos...');
      
      const { data: checkGroups } = await supabase
        .from('groups')
        .select('id')
        .limit(1);
      
      if (checkGroups && checkGroups.length > 0) {
        addLog('⚠️ Los grupos ya existen, recargando...');
        await fetchData();
        return;
      }
      
      const groupsPayload = [];
      for (let i = 0; i < configData.num_groups; i++) {
        groupsPayload.push({ 
          name: 'Grupo ' + String.fromCharCode(65 + i), 
          draw_order: i + 1 
        });
      }
      
      const { data: createdGroups, error } = await supabase
        .from('groups')
        .insert(groupsPayload)
        .select();
      
      if (error) throw error;
      
      setGroups(createdGroups || []);
      
      const emptyAssignments = {};
      (createdGroups || []).forEach(g => {
        emptyAssignments[g.id] = [];
      });
      setAssignments(emptyAssignments);
      
      addLog(`✅ ${createdGroups?.length || 0} grupos creados con éxito`);
    } catch (err) {
      addLog('❌ Error creando grupos: ' + err.message);
    }
  };

  const assignTeamToGroup = (teamId, groupId) => {
    setAssignments(prev => {
      const newAssignments = { ...prev };
      
      Object.keys(newAssignments).forEach(gId => {
        newAssignments[gId] = newAssignments[gId].filter(id => id !== teamId);
      });
      
      if (!newAssignments[groupId]) {
        newAssignments[groupId] = [];
      }
      
      if (!newAssignments[groupId].includes(teamId)) {
        newAssignments[groupId].push(teamId);
      }
      
      return newAssignments;
    });
  };

  const removeTeamFromGroup = (teamId, groupId) => {
    setAssignments(prev => {
      const newAssignments = { ...prev };
      if (newAssignments[groupId]) {
        newAssignments[groupId] = newAssignments[groupId].filter(id => id !== teamId);
      }
      return newAssignments;
    });
  };

  const getUnassignedTeams = () => {
    const assignedTeamIds = new Set();
    Object.values(assignments).forEach(teamIds => {
      teamIds.forEach(id => assignedTeamIds.add(id));
    });
    return teams.filter(t => !assignedTeamIds.has(t.id));
  };

  const saveAssignments = async () => {
    setSaving(true);
    try {
      addLog('💾 Guardando asignaciones...');
      
      const { error: deleteError } = await supabase
        .from('group_assignments')
        .delete()
        .gte('created_at', '1970-01-01T00:00:00.000Z');
      
      if (deleteError) throw deleteError;
      
      const assignmentsToInsert = [];
      let drawOrder = 1;
      
      Object.entries(assignments).forEach(([groupId, teamIds]) => {
        teamIds.forEach(teamId => {
          assignmentsToInsert.push({
            group_id: groupId,
            team_id: teamId,
            draw_order: drawOrder++
          });
        });
      });
      
      if (assignmentsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('group_assignments')
          .insert(assignmentsToInsert);
        
        if (insertError) throw insertError;
      }
      
      addLog(`✅ ${assignmentsToInsert.length} equipos guardados correctamente`);
      alert('✅ Asignaciones guardadas con éxito.');
      
    } catch (err) {
      console.error('Error saving:', err);
      addLog('❌ Error: ' + err.message);
      alert('❌ Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ✅ GENERAR CALENDARIO FANTASMA (PREVIEW)
  const generateDraftCalendar = async (forceRandom = false) => {
    if (!config) {
      alert('❌ Primero configura el torneo');
      return;
    }

    const totalAssigned = Object.values(assignments).reduce((sum, arr) => sum + arr.length, 0);
    if (totalAssigned === 0) {
      alert('❌ Primero asigna equipos a los grupos');
      return;
    }

    // ✅ Si ya hay un draft, preguntar si sobrescribir
    if (draftMatches.length > 0) {
      if (!confirm('⚠️ Ya tienes un calendario editado. ¿Seguro que quieres generar uno nuevo? Se perderán los cambios.')) {
        return;
      }
    }

    if (forceRandom) {
      addLog('🔀 Regenerando calendario aleatoriamente...');
    } else {
      addLog('🔮 Generando calendario fantasma (preview)...');
    }

    try {
      const groupsWithTeams = groups.map(group => {
        const groupTeamIds = assignments[group.id] || [];
        const groupTeams = groupTeamIds.map(teamId => {
          const team = teams.find(t => t.id === teamId);
          return team || { id: teamId, team_name: 'Desconocido' };
        });
        return { ...group, teams: groupTeams };
      });

      const getCurrentDraftHash = () => {
        if (draftMatches.length === 0) return null;
        return draftMatches
          .map(m => `${m.home_team_id}-${m.away_team_id}-${m.match_date}`)
          .sort()
          .join('|');
      };

      const previousHash = getCurrentDraftHash();
      
      let generatedMatches = [];
      let attempts = 0;
      const maxAttempts = 5;
      
      do {
        generatedMatches = scheduleMatchesPreview(
          groupsWithTeams, 
          config, 
          addLog,
          { randomize: forceRandom }
        );
        
        attempts++;
        
        if (!previousHash || !forceRandom) break;
        
        const newHash = generatedMatches
          .map(m => `${m.home_team_id}-${m.away_team_id}-${m.match_date}`)
          .sort()
          .join('|');
        
        if (newHash !== previousHash) break;
        
        addLog(`🔄 Intento ${attempts}: calendario igual al anterior, reintentando...`);
      } while (attempts < maxAttempts);
      
      if (attempts >= maxAttempts) {
        addLog('⚠️ Máximo de intentos alcanzado, usando último generado');
      }
      
      if (generatedMatches.length === 0) {
        addLog('❌ No se pudieron generar partidos');
        alert('❌ Error: no se pudieron generar partidos');
        return;
      }

      setDraftMatches(generatedMatches);
      setShowDraftPreview(true);
      setIsDraftConfirmed(false);
      
      // ✅ Guardar inmediatamente en localStorage
      saveDraftMatches(generatedMatches, groups);
      
      addLog(`✅ ${generatedMatches.length} partidos generados${forceRandom ? ' (aleatorio)' : ''}`);
      addLog('💡 Ahora puedes editar los partidos antes de confirmarlos');
      
    } catch (err) {
      console.error('Error generando draft:', err);
      addLog('❌ Error: ' + err.message);
      alert('❌ Error al generar calendario: ' + err.message);
    }
  };

  // ✅ EDITAR PARTIDO DEL DRAFT
  const startEditDraftMatch = (match) => {
    setEditingDraftId(match.draft_id);
    
    let localDate = '';
    if (match.match_date) {
      const date = new Date(match.match_date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      localDate = `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    
    setEditForm({
      match_date: localDate,
      court_number: match.court_number || '',
      referee_team_id: match.referee_team_id || ''
    });
  };

  const cancelEditDraft = () => {
    setEditingDraftId(null);
    setEditForm({});
  };

  const saveEditDraft = () => {
    if (!editingDraftId) return;
    
    let matchDateISO = null;
    if (editForm.match_date) {
      matchDateISO = new Date(editForm.match_date).toISOString();
    }
    
    const updates = {
      match_date: matchDateISO,
      court_number: editForm.court_number ? parseInt(editForm.court_number) : null,
      referee_team_id: editForm.referee_team_id || null
    };
    
    // ✅ Actualizar estado local
    const updatedMatches = draftMatches.map(m => 
      m.draft_id === editingDraftId ? { ...m, ...updates } : m
    );
    
    setDraftMatches(updatedMatches);
    
    // ✅ CRÍTICO: Guardar en localStorage inmediatamente
    saveDraftMatches(updatedMatches, groups);
    
    addLog(`✅ Partido actualizado y guardado`);
    cancelEditDraft();
  };

  // ✅ CONFIRMAR DRAFT
  const handleConfirmDraft = () => {
    if (!confirm('¿Confirmar este calendario? Se guardará como oficial cuando vayas a "Generar Calendario".')) {
      return;
    }
    
    confirmDraft();
    setIsDraftConfirmed(true);
    addLog('✅ Calendario fantasma CONFIRMADO');
    addLog('👉 Ve a "Sorteo y Calendario" para hacerlo oficial');
    alert('✅ Calendario confirmado. Ve a "Sorteo y Calendario" para hacerlo oficial.');
  };

  // ✅ DESCARTAR DRAFT
  const handleDiscardDraft = () => {
    if (!confirm('¿Descartar el calendario fantasma? Esta acción no se puede deshacer.')) {
      return;
    }
    
    clearDraft();
    setDraftMatches([]);
    setShowDraftPreview(false);
    setIsDraftConfirmed(false);
    addLog('🗑️ Calendario fantasma descartado');
  };

  // ✅ CARGAR DRAFT EXISTENTE
  const handleLoadDraft = () => {
    const draft = loadDraftMatches();
    if (draft) {
      setDraftMatches(draft.matches);
      setShowDraftPreview(true);
      setIsDraftConfirmed(hasConfirmedDraft());
      addLog(`📝 Draft cargado: ${draft.matches.length} partidos`);
    }
  };

  const goToScheduler = () => {
    navigate('/admin/draw');
  };

  const getTeamName = (teamId) => {
    const team = allTeamsList.find(t => t.id === teamId);
    return team?.team_name || 'Desconocido';
  };

  const getGroupName = (groupId) => {
    const group = groups.find(g => g.id === groupId);
    return group?.name || 'Grupo ?';
  };

  const formatDate = (iso) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('es-ES', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Cargando...</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className={styles.container}>
        <Card>
          <h2>⚠️ Configuración requerida</h2>
          <p>Configura el torneo primero en "Configuración".</p>
          <Button onClick={() => navigate('/admin/config')}>Ir a Configuración</Button>
        </Card>
      </div>
    );
  }

  const unassignedTeams = getUnassignedTeams();
  const totalAssigned = Object.values(assignments).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>🎯 Asignación Manual de Grupos</h1>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={fetchData}>🔄 Recargar</Button>
          <Button variant="primary" onClick={goToScheduler}>⚔️ Ir a Generar Calendario</Button>
        </div>
      </header>

      <div className={styles.infoBar}>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Configuración:</span>
          <span className={styles.infoValue}>{config.num_groups} grupos × {config.teams_per_group} equipos</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Equipos:</span>
          <span className={styles.infoValue}>{teams.length}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Asignados:</span>
          <span className={styles.infoValue}>{totalAssigned} / {teams.length}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Sin asignar:</span>
          <span className={styles.infoValue}>{unassignedTeams.length}</span>
        </div>
      </div>

      {/* SECCIÓN DE CALENDARIO FANTASMA */}
      <div className={styles.draftSection}>
        <h2 className={styles.sectionTitle}>🔮 Calendario Fantasma (Preview)</h2>
        <p className={styles.sectionDescription}>
          Genera un calendario de prueba usando el mismo algoritmo. Podrás editar los partidos (hora, pista, árbitro) 
          antes de confirmarlos. Una vez confirmado, ve a "Sorteo y Calendario" para hacerlo oficial.
        </p>
        
        <div className={styles.draftActions}>
          <Button 
            variant="primary" 
            onClick={() => generateDraftCalendar(false)}
            disabled={totalAssigned === 0}
          >
            🔮 Generar Preview
          </Button>
          
          <Button 
            variant="ghost" 
            onClick={() => generateDraftCalendar(true)}
            disabled={totalAssigned === 0 || isDraftConfirmed}
            title="Regenerar con distribución aleatoria diferente"
          >
            🔀 Regenerar aleatoriamente
          </Button>
          
          {showDraftPreview && (
            <>
              {!isDraftConfirmed ? (
                <Button variant="success" onClick={handleConfirmDraft}>
                  ✅ Confirmar Calendario
                </Button>
              ) : (
                <span className={styles.confirmedBadge}>✅ CONFIRMADO</span>
              )}
              <Button variant="danger" onClick={handleDiscardDraft}>
                🗑️ Descartar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* VISTA PREVIA DE PARTIDOS GENERADOS */}
      {showDraftPreview && draftMatches.length > 0 && (
        <div className={styles.draftPreview}>
          <h3 className={styles.previewTitle}>
            📋 Partidos Generados ({draftMatches.length})
            {isDraftConfirmed && <span className={styles.confirmedBadge}>✅ CONFIRMADO</span>}
          </h3>
          
          <div className={styles.draftMatchesList}>
            {draftMatches.map((match, idx) => (
              <div key={match.draft_id} className={styles.draftMatchCard}>
                {editingDraftId === match.draft_id ? (
                  // MODO EDICIÓN
                  <div className={styles.draftMatchEdit}>
                    <div className={styles.draftMatchHeader}>
                      <strong>#{idx + 1} - {getGroupName(match.group_id)}</strong>
                    </div>
                    <div className={styles.editForm}>
                      <div className={styles.editField}>
                        <label>Fecha y hora</label>
                        <input
                          type="datetime-local"
                          value={editForm.match_date || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, match_date: e.target.value }))}
                          className={styles.editInput}
                        />
                      </div>
                      <div className={styles.editField}>
                        <label>Pista</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={editForm.court_number || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, court_number: e.target.value }))}
                          className={styles.editInput}
                        />
                      </div>
                      <div className={styles.editField}>
                        <label>Árbitro</label>
                        <select
                          value={editForm.referee_team_id || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, referee_team_id: e.target.value }))}
                          className={styles.editInput}
                        >
                          <option value="">Sin asignar</option>
                          {allTeamsList.map(team => (
                            <option key={team.id} value={team.id}>{team.team_name}</option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.editActions}>
                        <Button variant="primary" size="sm" onClick={saveEditDraft}>💾 Guardar</Button>
                        <Button variant="ghost" size="sm" onClick={cancelEditDraft}>✕ Cancelar</Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // MODO VISUALIZACIÓN
                  <>
                    <div className={styles.draftMatchHeader}>
                      <span className={styles.draftMatchNumber}>#{idx + 1}</span>
                      <span className={styles.draftMatchGroup}>{getGroupName(match.group_id)}</span>
                      <span className={styles.draftMatchCode}>🔑 {match.verification_code}</span>
                    </div>
                    <div className={styles.draftMatchBody}>
                      <div className={styles.draftMatchTeams}>
                        <strong>{getTeamName(match.home_team_id)}</strong>
                        <span className={styles.vs}>vs</span>
                        <strong>{getTeamName(match.away_team_id)}</strong>
                      </div>
                      <div className={styles.draftMatchInfo}>
                        <span>📅 {formatDate(match.match_date)}</span>
                        <span>🏟️ Pista {match.court_number || '-'}</span>
                        <span>🎫 {match.referee_team_id ? getTeamName(match.referee_team_id) : 'Sin asignar'}</span>
                      </div>
                    </div>
                    <div className={styles.draftMatchActions}>
                      <button
                        className={styles.editDraftBtn}
                        onClick={() => startEditDraftMatch(match)}
                        title="Editar partido"
                        disabled={isDraftConfirmed}
                      >
                        ✏️ Editar
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECCIÓN DE GRUPOS */}
      <div className={styles.mainContent}>
        <div className={styles.unassignedPanel}>
          <h2>📋 Sin asignar ({unassignedTeams.length})</h2>
          <div className={styles.teamsList}>
            {unassignedTeams.length === 0 ? (
              <p className={styles.emptyMessage}>✅ Todos asignados</p>
            ) : (
              unassignedTeams.map(team => (
                <div key={team.id} className={styles.teamCard}>
                  {team.badge_url && (
                    <img src={team.badge_url} alt="" className={styles.teamBadge} />
                  )}
                  <span className={styles.teamName}>{team.team_name}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={styles.groupsContainer}>
          {groups.map(group => {
            const groupTeams = assignments[group.id] || [];
            const isFull = config.teams_per_group && groupTeams.length >= config.teams_per_group;
            
            return (
              <div key={group.id} className={`${styles.groupPanel} ${isFull ? styles.groupFull : ''}`}>
                <div className={styles.groupHeader}>
                  <h3>{group.name}</h3>
                  <span className={styles.groupCount}>
                    {groupTeams.length} / {config.teams_per_group || '?'}
                  </span>
                </div>
                
                <div className={styles.groupTeams}>
                  {groupTeams.length === 0 ? (
                    <p className={styles.emptyMessage}>Vacío</p>
                  ) : (
                    groupTeams.map(teamId => {
                      const team = teams.find(t => t.id === teamId);
                      if (!team) return null;
                      
                      return (
                        <div key={teamId} className={styles.assignedTeamCard}>
                          {team.badge_url && (
                            <img src={team.badge_url} alt="" className={styles.teamBadge} />
                          )}
                          <span className={styles.teamName}>{team.team_name}</span>
                          <button
                            className={styles.removeBtn}
                            onClick={() => removeTeamFromGroup(teamId, group.id)}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECCIÓN DE ASIGNACIÓN */}
      <div className={styles.assignmentPanel}>
        <h2>🎯 Asignar equipos</h2>
        <div className={styles.assignmentGrid}>
          {teams.map(team => {
            const assignedGroupId = Object.entries(assignments).find(([_, teamIds]) => 
              teamIds.includes(team.id)
            )?.[0];
            
            return (
              <div key={team.id} className={styles.assignmentRow}>
                <div className={styles.teamInfo}>
                  {team.badge_url && (
                    <img src={team.badge_url} alt="" className={styles.teamBadge} />
                  )}
                  <span className={styles.teamName}>{team.team_name}</span>
                  {assignedGroupId && (
                    <span className={styles.assignedBadge}>
                      en {groups.find(g => g.id === assignedGroupId)?.name}
                    </span>
                  )}
                </div>
                
                <div className={styles.groupButtons}>
                  {groups.map(group => {
                    const isAssigned = assignedGroupId === group.id;
                    const groupTeams = assignments[group.id] || [];
                    const isFull = config.teams_per_group && groupTeams.length >= config.teams_per_group;
                    
                    return (
                      <button
                        key={group.id}
                        className={`${styles.groupBtn} ${isAssigned ? styles.groupBtnActive : ''} ${isFull && !isAssigned ? styles.groupBtnDisabled : ''}`}
                        onClick={() => !isFull && assignTeamToGroup(team.id, group.id)}
                        disabled={isFull && !isAssigned}
                      >
                        {group.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.footerActions}>
        <Button variant="primary" onClick={saveAssignments} loading={saving} disabled={saving || totalAssigned === 0}>
          💾 Guardar Asignaciones
        </Button>
        <Button variant="ghost" onClick={goToScheduler}>
          ⚔️ Ir a Generar Calendario →
        </Button>
      </div>

      {logs.length > 0 && (
        <div className={styles.logsContainer}>
          <h3>📜 Registro</h3>
          <div className={styles.logs}>
            {logs.map((log, i) => (
              <p key={i} className={styles.logEntry}>{log}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}