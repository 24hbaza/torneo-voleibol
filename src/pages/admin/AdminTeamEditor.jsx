// src/pages/admin/AdminTeamEditor.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Card, Input, Button } from '../../design-system/components';
import styles from './AdminTeamEditor.module.css';

export default function AdminTeamEditor() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [team, setTeam] = useState(null);
  const [formData, setFormData] = useState({
    team_name: '',
    status: 'pending',
    players: [],
    badge_url: '',
    receipt_url: '',
    player_count: 0,
    captain_id: 0
  });

  useEffect(() => {
    const fetchTeam = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', teamId)
          .single();
        
        if (error) throw error;
        if (data) {
          setTeam(data);
          setFormData({
            team_name: data.team_name || '',
            status: data.status || 'pending',
            players: data.players || [],
            badge_url: data.badge_url || '',
            receipt_url: data.receipt_url || '',
            player_count: data.player_count || 0,
            captain_id: data.captain_id || 0
          });
        }
      } catch (err) {
        console.error('Error fetching team:', err);
        alert('Error al cargar el equipo');
      } finally {
        setLoading(false);
      }
    };
    fetchTeam();
  }, [teamId]);

  const updateField = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const updatePlayer = (index, field, value) => {
    const newPlayers = [...formData.players];
    newPlayers[index] = { ...newPlayers[index], [field]: value };
    updateField('players', newPlayers);
  };

  const addPlayer = () => {
    if (formData.players.length < 12) {
      updateField('players', [...formData.players, { name: '', surname: '', phone: '', dni: '', gender: 'male', photo_url: '' }]);
    }
  };

  const removePlayer = (index) => {
    if (formData.players.length > 1) {
      const newPlayers = formData.players.filter((_, i) => i !== index);
      updateField('players', newPlayers);
    }
  };

  const handlePlayerPhoto = async (index, file) => {
    if (!file || !teamId) return;
    try {
      const ext = file.name.split('.').pop();
      const path = `player-photos/${teamId}_player_${index}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('player-photos').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('player-photos').getPublicUrl(path);
      const newPlayers = [...formData.players];
      newPlayers[index] = { ...newPlayers[index], photo_url: data.publicUrl };
      updateField('players', newPlayers);
    } catch (err) {
      console.error('Error uploading photo:', err);
      alert('Error al subir la foto');
    }
  };

  const removePlayerPhoto = async (index) => {
    if (!teamId) return;
    const player = formData.players[index];
    if (!player.photo_url) return;
    
    try {
      const urlParts = player.photo_url.split('/player-photos/');
      if (urlParts.length > 1) {
        const path = `player-photos/${urlParts[1]}`;
        await supabase.storage.from('player-photos').remove([path]);
      }
      const newPlayers = [...formData.players];
      newPlayers[index] = { ...newPlayers[index], photo_url: '' };
      updateField('players', newPlayers);
    } catch (err) {
      console.error('Error removing photo:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!formData.team_name.trim()) throw new Error('El nombre del equipo es obligatorio');
      const femaleCount = formData.players.filter(p => p.gender === 'female').length;
      if (femaleCount < 2) throw new Error('Cada equipo debe tener al menos 2 jugadoras femeninas');

      // ✅ CORREGIDO: Eliminada la línea 'updated_at' que causaba el error de esquema
      const { error } = await supabase.from('profiles').update({
        team_name: formData.team_name.trim(),
        status: formData.status,
        players: formData.players,
        player_count: formData.players.length,
        badge_url: formData.badge_url,
        receipt_url: formData.receipt_url,
        captain_id: formData.captain_id
      }).eq('id', teamId);

      if (error) throw error;
      alert('✅ Equipo actualizado correctamente');
      navigate('/admin/teams');
    } catch (err) {
      console.error('Error saving team:', err);
      alert('❌ Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className={styles.loading}>Cargando datos del equipo...</div>;

  return (
    <div className={styles.container}>
      <Card title={`✏️ Editar: ${formData.team_name || 'Equipo'}`}>
        
        <div className={styles.formGrid}>
          <Input label="Nombre del Equipo *" value={formData.team_name} onChange={(e) => updateField('team_name', e.target.value)} fullWidth placeholder="Ej: Club Voleibol Ejemplo" />
          <div className={styles.field}>
            <label>Estado del Equipo</label>
            <select value={formData.status} onChange={(e) => updateField('status', e.target.value)} className={styles.select}>
              <option value="pending">⏳ Pendiente</option>
              <option value="accepted">✅ Aceptado</option>
              <option value="rejected">❌ Rechazado</option>
            </select>
          </div>
        </div>

        <h3 className={styles.sectionTitle}>👥 Plantilla ({formData.players.length}/12) <span className={formData.players.filter(p => p.gender === 'female').length < 2 ? styles.warning : ''}>👩 {formData.players.filter(p => p.gender === 'female').length}/2 mín.</span></h3>
        
        <div className={styles.playersList}>
          {formData.players.map((player, index) => (
            <div key={index} className={styles.playerRow}>
              <span className={styles.num}>#{index + 1}</span>
              <input placeholder="Nombre" value={player.name || ''} onChange={(e) => updatePlayer(index, 'name', e.target.value)} className={styles.inputSmall} />
              <input placeholder="Apellidos" value={player.surname || ''} onChange={(e) => updatePlayer(index, 'surname', e.target.value)} className={styles.inputSmall} />
              
              <div className={styles.genderCell}>
                <label><input type="radio" name={`gender-${index}`} value="male" checked={player.gender === 'male'} onChange={(e) => updatePlayer(index, 'gender', e.target.value)} /> 👨</label>
                <label><input type="radio" name={`gender-${index}`} value="female" checked={player.gender === 'female'} onChange={(e) => updatePlayer(index, 'gender', e.target.value)} /> 👩</label>
              </div>
              
              <input placeholder="Teléfono" type="tel" value={player.phone || ''} onChange={(e) => updatePlayer(index, 'phone', e.target.value)} className={styles.inputSmall} />
              <input placeholder="DNI" value={player.dni || ''} onChange={(e) => updatePlayer(index, 'dni', e.target.value)} className={styles.inputSmall} />
              
              <div className={styles.photoCell}>
                {player.photo_url ? (
                  <>
                    <img src={player.photo_url} alt="Foto" className={styles.miniPhoto} />
                    <button type="button" onClick={() => removePlayerPhoto(index)} className={styles.removePhotoBtn} title="Eliminar foto">🗑️</button>
                  </>
                ) : (
                  <span className={styles.noPhoto}>📷</span>
                )}
                <input type="file" accept="image/*" onChange={(e) => handlePlayerPhoto(index, e.target.files?.[0])} className={styles.miniFile} id={`admin-photo-${index}`} />
                <label htmlFor={`admin-photo-${index}`} className={styles.uploadLabel}>Subir</label>
              </div>
              
              <Button variant="danger" size="sm" onClick={() => removePlayer(index)} title="Eliminar jugador">✕</Button>
            </div>
          ))}
        </div>
        
        {formData.players.length < 12 && <Button variant="ghost" onClick={addPlayer} fullWidth className={styles.addBtn}>+ Añadir Jugador</Button>}

        <div className={styles.docsSection}>
          <h3 className={styles.sectionTitle}>📂 Documentos</h3>
          <div className={styles.docRow}>
            <label>🏐 Escudo</label>
            {formData.badge_url && <a href={formData.badge_url} target="_blank" rel="noopener noreferrer" className={styles.docLink}>👁️ Ver</a>}
          </div>
          <div className={styles.docRow}>
            <label>📄 Recibo</label>
            {formData.receipt_url && <a href={formData.receipt_url} target="_blank" rel="noopener noreferrer" className={styles.docLink}>👁️ Ver</a>}
          </div>
        </div>

        <div className={styles.actions}>
          <Button variant="ghost" onClick={() => navigate('/admin/teams')}>← Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={handleSave} disabled={saving}>💾 Guardar Cambios</Button>
        </div>
      </Card>
    </div>
  );
}