// src/pages/admin/ManualGroupAssignment.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Button, Card } from '../../design-system/components';
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
      // Obtener configuración
      const { data: configData } = await supabase
        .from('tournament_config')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!configData) {
        addLog('⚠️ No hay configuración. Ve a Configuración primero.');
        setLoading(false);
        return;
      }
      
      setConfig(configData);
      addLog('✅ Configuración cargada: ' + configData.num_groups + ' grupos');

      // Obtener equipos aceptados
      const { data: teamsData } = await supabase
        .from('profiles')
        .select('id, team_name, badge_url')
        .eq('status', 'accepted')
        .order('team_name');
      
      setTeams(teamsData || []);
      addLog('✅ ' + (teamsData?.length || 0) + ' equipos cargados');

      // Verificar si ya existen grupos
      const { data: existingGroups, error: groupsError } = await supabase
        .from('groups')
        .select('*')
        .order('draw_order');
      
      if (groupsError) {
        throw groupsError;
      }

      if (existingGroups && existingGroups.length > 0) {
        // ✅ ELIMINAR DUPLICADOS por ID
        const uniqueGroups = existingGroups.filter((group, index, self) =>
          index === self.findIndex((g) => g.id === group.id)
        );
        
        setGroups(uniqueGroups);
        
        // Cargar asignaciones existentes
        const { data: existingAssignments } = await supabase
          .from('group_assignments')
          .select('group_id, team_id');
        
        if (existingAssignments) {
          const assignMap = {};
          existingAssignments.forEach(a => {
            if (!assignMap[a.group_id]) assignMap[a.group_id] = [];
            if (!assignMap[a.group_id].includes(a.team_id)) {
              assignMap[a.group_id].push(a.team_id);
            }
          });
          setAssignments(assignMap);
        }
        
        addLog('✅ Grupos cargados: ' + uniqueGroups.length);
      } else {
        // Crear grupos según configuración
        await createGroups(configData);
      }

    } catch (err) {
      console.error('Error fetching data:', err);
      addLog('❌ Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const createGroups = async (configData) => {
    if (!configData) {
      addLog('❌ Error: No hay configuración disponible');
      return;
    }
    
    try {
      addLog('📂 Creando grupos...');
      
      // ✅ Verificar primero si ya existen
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
      
      // ✅ Usar setGroups directamente, no añadir
      setGroups(createdGroups);
      
      // Inicializar asignaciones vacías
      const emptyAssignments = {};
      createdGroups.forEach(g => {
        emptyAssignments[g.id] = [];
      });
      setAssignments(emptyAssignments);
      
      addLog('✅ ' + createdGroups.length + ' grupos creados');
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
      newAssignments[groupId].push(teamId);
      
      return newAssignments;
    });
  };

  const removeTeamFromGroup = (teamId, groupId) => {
    setAssignments(prev => {
      const newAssignments = { ...prev };
      newAssignments[groupId] = newAssignments[groupId].filter(id => id !== teamId);
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
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
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
      
      addLog('✅ ' + assignmentsToInsert.length + ' equipos asignados');
      alert('✅ Asignaciones guardadas. Ve a "Sorteo y Calendario" para generar partidos.');
      
    } catch (err) {
      console.error('Error saving:', err);
      addLog('❌ Error: ' + err.message);
      alert('❌ Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const goToScheduler = () => {
    navigate('/admin/draw');
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

  // ✅ FILTRAR grupos duplicados para renderizado
  const uniqueGroupsForRender = groups.filter((group, index, self) =>
    index === self.findIndex((g) => g.id === group.id)
  );

  const unassignedTeams = getUnassignedTeams();
  const totalAssigned = Object.values(assignments).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>🎯 Asignación Manual de Grupos</h1>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={fetchData}>🔄 Recargar</Button>
          <Button variant="primary" onClick={goToScheduler}>⚔️ Generar Calendario</Button>
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
          {uniqueGroupsForRender.map(group => {
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
                  {uniqueGroupsForRender.map(group => {
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
          💾 Guardar
        </Button>
        <Button variant="ghost" onClick={goToScheduler}>
          ⚔️ Generar Calendario →
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