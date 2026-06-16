// src/pages/admin/AdminMatches.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Badge, Button } from '../../design-system/components';
import styles from './AdminMatches.module.css';

// ✅ Opciones de fase para el selector
const STAGE_OPTIONS = [
  { value: 'group', label: '📊 Fase de Grupos' },
  { value: 'playoff', label: '🔥 Playoffs' },
  { value: 'semifinal', label: '🥊 Semifinal' },
  { value: 'final', label: '🏆 Final' },
  { value: 'third_place', label: '🥉 3º y 4º' }
];

// ✅ Opciones de estado
const STATUS_OPTIONS = [
  { value: 'scheduled', label: '⏳ Programado' },
  { value: 'live', label: '🔴 En Vivo' },
  { value: 'finished', label: '✅ Finalizado' }
];

export default function AdminMatches() {
  const [matches, setMatches] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // ✅ Estado para el modal de edición completa
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [editForm, setEditForm] = useState({
    match_date: '',
    court_number: '',
    referee_team_id: '',
    stage: 'group',
    status: 'scheduled',
    sets_details: [],
    home_score: 0,
    away_score: 0,
    mvp_male_name: '',
    mvp_female_name: '',
    mvp_male_photo_url: '',
    mvp_female_photo_url: ''
  });

  // ✅ Estado para los jugadores de ambos equipos
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);

  useEffect(() => {
    fetchMatches();
    fetchTeams();
    
    const channel = supabase
      .channel('admin_matches')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'matches' }, 
        fetchMatches
      )
      .subscribe();
    
    return () => supabase.removeChannel(channel);
  }, []);

  const fetchTeams = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, team_name')
      .eq('status', 'accepted')
      .order('team_name');
    
    if (data) setAllTeams(data);
  };

  const fetchMatches = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('matches')
      .select(`
        *,
        home:profiles!matches_home_team_id_fkey(team_name),
        away:profiles!matches_away_team_id_fkey(team_name),
        referee:profiles!matches_referee_team_id_fkey(team_name)
      `)
      .order('match_date');
    
    if (data) setMatches(data);
    setLoading(false);
  };

  // ✅ Cargar jugadores de ambos equipos
  const fetchPlayers = async (homeTeamId, awayTeamId) => {
    try {
      // Cargar jugadores del equipo local
      const { data: homeData, error: homeError } = await supabase
        .from('profiles')
        .select('players')
        .eq('id', homeTeamId)
        .single();
      
      if (homeData?.players) {
        setHomePlayers(homeData.players.map((p, i) => ({ ...p, index: i, team_id: homeTeamId })));
      } else {
        setHomePlayers([]);
      }
      
      // Cargar jugadores del equipo visitante
      const { data: awayData, error: awayError } = await supabase
        .from('profiles')
        .select('players')
        .eq('id', awayTeamId)
        .single();
      
      if (awayData?.players) {
        setAwayPlayers(awayData.players.map((p, i) => ({ ...p, index: i, team_id: awayTeamId })));
      } else {
        setAwayPlayers([]);
      }
    } catch (err) {
      console.error('Error cargando jugadores:', err);
      setHomePlayers([]);
      setAwayPlayers([]);
    }
  };

  // ✅ Actualizar fase de un partido (mantener funcionalidad existente)
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
      setMatches(prev => prev.map(m => 
        m.id === matchId ? { ...m, stage: newStage } : m
      ));
    }
    setSaving(false);
    setEditingId(null);
  };

  // ✅ Abrir modal de edición completa
  const openEditModal = async (match) => {
    setSelectedMatch(match);
    
    // Parsear sets_details si existe
    let setsDetails = [];
    try {
      if (match.sets_details) {
        if (typeof match.sets_details === 'string') {
          setsDetails = JSON.parse(match.sets_details);
        } else if (Array.isArray(match.sets_details)) {
          setsDetails = match.sets_details;
        }
      }
    } catch (e) {
      console.warn('Error parseando sets_details:', e);
      setsDetails = [];
    }
    
    // Convertir fecha a formato local para el input
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
      referee_team_id: match.referee_team_id || '',
      stage: match.stage || 'group',
      status: match.status || 'scheduled',
      sets_details: setsDetails,
      home_score: match.home_score || 0,
      away_score: match.away_score || 0,
      mvp_male_name: match.mvp_male_name || '',
      mvp_female_name: match.mvp_female_name || '',
      mvp_male_photo_url: match.mvp_male_photo_url || '',
      mvp_female_photo_url: match.mvp_female_photo_url || ''
    });
    
    // ✅ Cargar jugadores de ambos equipos
    if (match.home_team_id && match.away_team_id) {
      await fetchPlayers(match.home_team_id, match.away_team_id);
    }
    
    setIsModalOpen(true);
  };

  // ✅ Cerrar modal
  const closeEditModal = () => {
    setIsModalOpen(false);
    setSelectedMatch(null);
    setHomePlayers([]);
    setAwayPlayers([]);
    setEditForm({
      match_date: '',
      court_number: '',
      referee_team_id: '',
      stage: 'group',
      status: 'scheduled',
      sets_details: [],
      home_score: 0,
      away_score: 0,
      mvp_male_name: '',
      mvp_female_name: '',
      mvp_male_photo_url: '',
      mvp_female_photo_url: ''
    });
  };

  // ✅ Añadir set
  const addSet = () => {
    setEditForm(prev => ({
      ...prev,
      sets_details: [...prev.sets_details, [0, 0]]
    }));
  };

  // ✅ Actualizar puntuación de un set
  const updateSetScore = (setIndex, team, value) => {
    const newSets = [...editForm.sets_details];
    const set = [...newSets[setIndex]];
    
    if (team === 'home') {
      set[0] = parseInt(value) || 0;
    } else {
      set[1] = parseInt(value) || 0;
    }
    
    newSets[setIndex] = set;
    
    // Calcular automáticamente home_score y away_score
    let homeWon = 0;
    let awayWon = 0;
    newSets.forEach(s => {
      if (s[0] > s[1]) homeWon++;
      else if (s[1] > s[0]) awayWon++;
    });
    
    setEditForm(prev => ({
      ...prev,
      sets_details: newSets,
      home_score: homeWon,
      away_score: awayWon
    }));
  };

  // ✅ Eliminar set
  const removeSet = (setIndex) => {
    const newSets = editForm.sets_details.filter((_, i) => i !== setIndex);
    
    // Recalcular scores
    let homeWon = 0;
    let awayWon = 0;
    newSets.forEach(s => {
      if (s[0] > s[1]) homeWon++;
      else if (s[1] > s[0]) awayWon++;
    });
    
    setEditForm(prev => ({
      ...prev,
      sets_details: newSets,
      home_score: homeWon,
      away_score: awayWon
    }));
  };

  // ✅ Seleccionar MVP masculino
  const selectMvpMale = (player) => {
    if (!player) {
      setEditForm(prev => ({
        ...prev,
        mvp_male_name: '',
        mvp_male_photo_url: ''
      }));
      return;
    }
    
    const fullName = `${player.name} ${player.surname}`;
    setEditForm(prev => ({
      ...prev,
      mvp_male_name: fullName,
      mvp_male_photo_url: player.photo_url || ''
    }));
  };

  // ✅ Seleccionar MVP femenino
  const selectMvpFemale = (player) => {
    if (!player) {
      setEditForm(prev => ({
        ...prev,
        mvp_female_name: '',
        mvp_female_photo_url: ''
      }));
      return;
    }
    
    const fullName = `${player.name} ${player.surname}`;
    setEditForm(prev => ({
      ...prev,
      mvp_female_name: fullName,
      mvp_female_photo_url: player.photo_url || ''
    }));
  };

  // ✅ Filtrar jugadores por género
  const getPlayersByGender = (gender) => {
    const allPlayers = [...homePlayers, ...awayPlayers];
    return allPlayers.filter(p => {
      if (!p.gender) return false;
      const g = p.gender.toLowerCase();
      if (gender === 'male') {
        return ['male', 'm', 'hombre', 'masculino'].includes(g);
      } else {
        return ['female', 'f', 'mujer', 'femenino'].includes(g);
      }
    });
  };

  // ✅ Guardar cambios del partido
  const saveMatch = async () => {
    if (!selectedMatch) return;
    
    setSaving(true);
    try {
      // Convertir fecha local a ISO
      let matchDateISO = null;
      if (editForm.match_date) {
        matchDateISO = new Date(editForm.match_date).toISOString();
      }
      
      const updateData = {
        match_date: matchDateISO,
        court_number: editForm.court_number ? parseInt(editForm.court_number) : null,
        referee_team_id: editForm.referee_team_id || null,
        stage: editForm.stage,
        status: editForm.status,
        sets_details: JSON.stringify(editForm.sets_details),
        home_score: editForm.home_score,
        away_score: editForm.away_score
      };
      
      // Si el estado es finished y hay sets, asegurar que los scores estén correctos
      if (editForm.status === 'finished' && editForm.sets_details.length > 0) {
        let homeWon = 0;
        let awayWon = 0;
        editForm.sets_details.forEach(s => {
          if (s[0] > s[1]) homeWon++;
          else if (s[1] > s[0]) awayWon++;
        });
        updateData.home_score = homeWon;
        updateData.away_score = awayWon;
      }
      
      // ✅ MVPs - Solo actualizar si hay selección
      if (editForm.mvp_male_name) {
        updateData.mvp_male_name = editForm.mvp_male_name;
        updateData.mvp_male_photo_url = editForm.mvp_male_photo_url;
        updateData.mvp_male_voted = true;
      } else {
        // Si se borró, limpiar los campos
        updateData.mvp_male_name = null;
        updateData.mvp_male_photo_url = null;
        updateData.mvp_male_voted = false;
      }
      
      if (editForm.mvp_female_name) {
        updateData.mvp_female_name = editForm.mvp_female_name;
        updateData.mvp_female_photo_url = editForm.mvp_female_photo_url;
        updateData.mvp_female_voted = true;
      } else {
        updateData.mvp_female_name = null;
        updateData.mvp_female_photo_url = null;
        updateData.mvp_female_voted = false;
      }
      
      // Si ambos MVPs están votados, marcar mvp_voted como true
      if (editForm.mvp_male_name && editForm.mvp_female_name) {
        updateData.mvp_voted = true;
      } else if (!editForm.mvp_male_name && !editForm.mvp_female_name) {
        updateData.mvp_voted = false;
      }
      
      const { error } = await supabase
        .from('matches')
        .update(updateData)
        .eq('id', selectedMatch.id);
      
      if (error) throw error;
      
      alert('✅ Partido actualizado correctamente');
      closeEditModal();
      await fetchMatches();
      
    } catch (err) {
      console.error('Error al guardar partido:', err);
      alert('❌ Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (iso) => iso ? new Date(iso).toLocaleString('es-ES') : '-';

  const getStageLabel = (value) => {
    const opt = STAGE_OPTIONS.find(o => o.value === value);
    return opt?.label || 'Fase desconocida';
  };

  // ✅ Calcular sets ganados para mostrar en la tabla
  const calculateSets = (match) => {
    let homeWon = 0;
    let awayWon = 0;
    
    if (match.sets_details) {
      try {
        const sets = typeof match.sets_details === 'string' 
          ? JSON.parse(match.sets_details) 
          : match.sets_details;
        
        if (Array.isArray(sets)) {
          sets.forEach(s => {
            if (s[0] > s[1]) homeWon++;
            else if (s[1] > s[0]) awayWon++;
          });
        }
      } catch (e) {
        homeWon = match.home_score || 0;
        awayWon = match.away_score || 0;
      }
    } else {
      homeWon = match.home_score || 0;
      awayWon = match.away_score || 0;
    }
    
    return `${homeWon} - ${awayWon}`;
  };

  // ✅ Obtener nombre del equipo del jugador
  const getPlayerTeamName = (player) => {
    if (player.team_id === selectedMatch?.home_team_id) {
      return selectedMatch.home?.team_name || 'Local';
    } else if (player.team_id === selectedMatch?.away_team_id) {
      return selectedMatch.away?.team_name || 'Visitante';
    }
    return '';
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
                <th>Código</th>
                <th>🎯 Fase</th>
                <th>Resultado</th>
                <th>MVPs</th>
                <th>Estado</th>
                <th>Acciones</th>
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
                  <td><code className={styles.code}>{m.verification_code || '-'}</code></td>
                  
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
                  
                  {/* ✅ COLUMNA: RESULTADO */}
                  <td>
                    <span className={styles.resultBadge}>
                      {calculateSets(m)}
                    </span>
                  </td>
                  
                  {/* ✅ NUEVA COLUMNA: MVPs */}
                  <td>
                    <div className={styles.mvpCell}>
                      {m.mvp_male_voted && (
                        <div className={styles.mvpMiniBadge} title={`MVP Masculino: ${m.mvp_male_name}`}>
                          👨
                        </div>
                      )}
                      {m.mvp_female_voted && (
                        <div className={styles.mvpMiniBadge} title={`MVP Femenino: ${m.mvp_female_name}`}>
                          👩
                        </div>
                      )}
                      {!m.mvp_male_voted && !m.mvp_female_voted && (
                        <span style={{color:'var(--text-muted)', fontSize: '0.8rem'}}>-</span>
                      )}
                    </div>
                  </td>
                  
                  <td>
                    <Badge variant={
                      m.status === 'live' ? 'live' : 
                      m.status === 'finished' ? 'finished' : 'scheduled'
                    }>
                      {m.status}
                    </Badge>
                  </td>
                  
                  {/* ✅ COLUMNA: ACCIONES */}
                  <td>
                    <button
                      className={styles.editFullBtn}
                      onClick={() => openEditModal(m)}
                      title="Editar partido completo"
                    >
                      ✏️ Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ✅ MODAL DE EDICIÓN COMPLETA */}
      {isModalOpen && selectedMatch && (
        <div className={styles.modalOverlay} onClick={closeEditModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>✏️ Editar Partido</h2>
              <button className={styles.closeModalBtn} onClick={closeEditModal}>✕</button>
            </div>

            <div className={styles.modalBody}>
              {/* Información del enfrentamiento */}
              <div className={styles.matchInfo}>
                <strong>{selectedMatch.home?.team_name}</strong> vs <strong>{selectedMatch.away?.team_name}</strong>
              </div>

              {/* Fecha y Hora */}
              <div className={styles.formGroup}>
                <label>📅 Fecha y Hora</label>
                <input
                  type="datetime-local"
                  value={editForm.match_date}
                  onChange={(e) => setEditForm(prev => ({ ...prev, match_date: e.target.value }))}
                  className={styles.formInput}
                />
              </div>

              {/* Pista y Árbitro */}
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>🏟️ Pista</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={editForm.court_number}
                    onChange={(e) => setEditForm(prev => ({ ...prev, court_number: e.target.value }))}
                    className={styles.formInput}
                    placeholder="Ej: 1"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>🎫 Árbitro</label>
                  <select
                    value={editForm.referee_team_id}
                    onChange={(e) => setEditForm(prev => ({ ...prev, referee_team_id: e.target.value }))}
                    className={styles.formSelect}
                  >
                    <option value="">Sin asignar</option>
                    {allTeams.map(team => (
                      <option key={team.id} value={team.id}>
                        {team.team_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Fase y Estado */}
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>🎯 Fase</label>
                  <select
                    value={editForm.stage}
                    onChange={(e) => setEditForm(prev => ({ ...prev, stage: e.target.value }))}
                    className={styles.formSelect}
                  >
                    {STAGE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>📊 Estado</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                    className={styles.formSelect}
                  >
                    {STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sets y Puntuaciones */}
              <div className={styles.setsSection}>
                <div className={styles.setsHeader}>
                  <h3>🏐 Sets ({editForm.sets_details.length})</h3>
                  <button className={styles.addSetBtn} onClick={addSet}>
                    + Añadir Set
                  </button>
                </div>

                {editForm.sets_details.length === 0 ? (
                  <p className={styles.noSets}>No hay sets registrados. Añade sets para registrar el resultado.</p>
                ) : (
                  <div className={styles.setsList}>
                    {editForm.sets_details.map((set, index) => (
                      <div key={index} className={styles.setRow}>
                        <span className={styles.setLabel}>Set {index + 1}</span>
                        
                        <div className={styles.setScores}>
                          <div className={styles.setTeam}>
                            <span className={styles.teamName}>{selectedMatch.home?.team_name}</span>
                            <input
                              type="number"
                              min="0"
                              value={set[0]}
                              onChange={(e) => updateSetScore(index, 'home', e.target.value)}
                              className={styles.scoreInput}
                            />
                          </div>
                          
                          <span className={styles.setSeparator}>-</span>
                          
                          <div className={styles.setTeam}>
                            <span className={styles.teamName}>{selectedMatch.away?.team_name}</span>
                            <input
                              type="number"
                              min="0"
                              value={set[1]}
                              onChange={(e) => updateSetScore(index, 'away', e.target.value)}
                              className={styles.scoreInput}
                            />
                          </div>
                        </div>
                        
                        <button
                          className={styles.removeSetBtn}
                          onClick={() => removeSet(index)}
                          title="Eliminar set"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Resumen de sets ganados */}
                {editForm.sets_details.length > 0 && (
                  <div className={styles.setsSummary}>
                    <strong>Resultado final:</strong> {editForm.home_score} - {editForm.away_score}
                  </div>
                )}
              </div>

              {/* ✅ SECCIÓN DE MVPs */}
              <div className={styles.mvpSection}>
                <h3>🏆 MVPs del Partido</h3>
                <p className={styles.mvpDescription}>
                  Selecciona los jugadores más destacados del partido (opcional)
                </p>

                {/* MVP Masculino */}
                <div className={styles.mvpGroup}>
                  <div className={styles.mvpGroupHeader}>
                    <span className={styles.mvpGroupIcon}>👨</span>
                    <span className={styles.mvpGroupTitle}>MVP Masculino</span>
                    {editForm.mvp_male_name && (
                      <button 
                        className={styles.clearMvpBtn}
                        onClick={() => selectMvpMale(null)}
                        title="Quitar selección"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  
                  {editForm.mvp_male_name ? (
                    <div className={styles.selectedMvp}>
                      <div className={styles.selectedMvpInfo}>
                        <span className={styles.selectedMvpName}>{editForm.mvp_male_name}</span>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.mvpGrid}>
                      {getPlayersByGender('male').length === 0 ? (
                        <p className={styles.noPlayers}>No hay jugadores masculinos registrados</p>
                      ) : (
                        getPlayersByGender('male').map((player, idx) => (
                          <button
                            key={`male-${player.team_id}-${player.index}`}
                            className={styles.mvpPlayerCard}
                            onClick={() => selectMvpMale(player)}
                          >
                            <div className={styles.mvpPlayerAvatar}>
                              {player.photo_url ? (
                                <img src={player.photo_url} alt={player.name} />
                              ) : (
                                <span>👤</span>
                              )}
                            </div>
                            <div className={styles.mvpPlayerInfo}>
                              <span className={styles.mvpPlayerName}>{player.name} {player.surname}</span>
                              <span className={styles.mvpPlayerTeam}>{getPlayerTeamName(player)}</span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* MVP Femenino */}
                <div className={styles.mvpGroup}>
                  <div className={styles.mvpGroupHeader}>
                    <span className={styles.mvpGroupIcon}>👩</span>
                    <span className={styles.mvpGroupTitle}>MVP Femenino</span>
                    {editForm.mvp_female_name && (
                      <button 
                        className={styles.clearMvpBtn}
                        onClick={() => selectMvpFemale(null)}
                        title="Quitar selección"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  
                  {editForm.mvp_female_name ? (
                    <div className={styles.selectedMvp}>
                      <div className={styles.selectedMvpInfo}>
                        <span className={styles.selectedMvpName}>{editForm.mvp_female_name}</span>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.mvpGrid}>
                      {getPlayersByGender('female').length === 0 ? (
                        <p className={styles.noPlayers}>No hay jugadoras femeninas registradas</p>
                      ) : (
                        getPlayersByGender('female').map((player, idx) => (
                          <button
                            key={`female-${player.team_id}-${player.index}`}
                            className={styles.mvpPlayerCard}
                            onClick={() => selectMvpFemale(player)}
                          >
                            <div className={styles.mvpPlayerAvatar}>
                              {player.photo_url ? (
                                <img src={player.photo_url} alt={player.name} />
                              ) : (
                                <span>👤</span>
                              )}
                            </div>
                            <div className={styles.mvpPlayerInfo}>
                              <span className={styles.mvpPlayerName}>{player.name} {player.surname}</span>
                              <span className={styles.mvpPlayerTeam}>{getPlayerTeamName(player)}</span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <Button variant="ghost" onClick={closeEditModal} disabled={saving}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={saveMatch} loading={saving} disabled={saving}>
                💾 Guardar Cambios
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}