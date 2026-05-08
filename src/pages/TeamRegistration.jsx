import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store';
import { Card, Input, Button } from '../design-system/components';
import styles from './TeamRegistration.module.css';

export default function TeamRegistration() {
  const navigate = useNavigate();
  const { user, profile, updateProfile } = useAuthStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Estado inicial del formulario
  const [formData, setFormData] = useState({
    team_name: profile?.team_name || '',
    players: profile?.players || [{ name: '', surname: '', phone: '', dni: '', gender: 'male', photo: null, photo_url: '' }],
    captain_index: profile?.captain_index || 0,
    receipt: null,
    badge: null,
    receipt_url: profile?.receipt_url || '',
    badge_url: profile?.badge_url || ''
  });

  // ✅ Persistencia en localStorage
  const STORAGE_KEY = `voley_reg_${user?.id || 'pending'}`;

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setFormData(prev => ({ ...prev, ...JSON.parse(saved) })); } 
      catch(e) { console.warn('Error cargando datos guardados', e); }
    }
  }, [user?.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
    }, 300);
    return () => clearTimeout(timer);
  }, [formData]);

  const updateField = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));
  
  const updatePlayer = (index, field, value) => {
    const newPlayers = [...formData.players];
    newPlayers[index] = { ...newPlayers[index], [field]: value };
    updateField('players', newPlayers);
  };

  const addPlayer = () => {
    if (formData.players.length < 12) {
      updateField('players', [...formData.players, { name: '', surname: '', phone: '', dni: '', gender: 'male', photo: null, photo_url: '' }]);
    }
  };
  
  const removePlayer = (index) => {
    if (formData.players.length > 1) {
      const newPlayers = formData.players.filter((_, i) => i !== index);
      updateField('players', newPlayers);
    }
  };

  const handlePlayerPhoto = (index, file) => {
    if (!file) return;
    const newPlayers = [...formData.players];
    newPlayers[index] = { ...newPlayers[index], photo: file, photo_url: URL.createObjectURL(file) };
    updateField('players', newPlayers);
  };

  const uploadFile = async (file, folder, fileName) => {
    if (!file) return null;
    const ext = file.name.split('.').pop();
    const path = `${folder}/${user?.id || 'temp'}_${fileName || Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('team-files').upload(path, file, { upsert: true });
    if (uploadErr) throw new Error(`Error subiendo ${folder}: ${uploadErr.message}`);
    const { data } = supabase.storage.from('team-files').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Validaciones básicas
      if (!formData.team_name.trim()) throw new Error('Nombre del equipo obligatorio.');
      if (formData.players.length < 4) throw new Error('Mínimo 4 jugadores.');
      if (formData.players.some(p => !p.name.trim() || !p.surname.trim())) throw new Error('Completa nombre y apellidos de todos los jugadores.');
      
      const femaleCount = formData.players.filter(p => p.gender === 'female').length;
      if (femaleCount < 2) throw new Error('Cada equipo debe tener al menos 2 jugadoras femeninas.');

      // 2. ✅ VALIDACIÓN ESTRICTA: Recibo obligatorio
      if (!formData.receipt && !formData.receipt_url) {
        throw new Error('⚠️ Es obligatorio subir el comprobante de pago (recibo) para completar la inscripción.');
      }

      setLoading(true);
      setError('Subiendo documentos y fotos...');

      // 3. Subida de archivos
      const playersWithUrls = await Promise.all(formData.players.map(async (p, i) => {
        const photoUrl = p.photo ? await uploadFile(p.photo, 'player-photos', `player_${i}`) : p.photo_url;
        const { photo, ...cleanPlayer } = p;
        return { ...cleanPlayer, photo_url: photoUrl };
      }));

      const receiptUrl = formData.receipt ? await uploadFile(formData.receipt, 'receipts', 'receipt') : formData.receipt_url;
      const badgeUrl = formData.badge ? await uploadFile(formData.badge, 'badges', 'badge') : formData.badge_url;

      // 4. Guardado en base de datos
      const { error: dbErr } = await supabase.from('profiles').update({
        team_name: formData.team_name.trim(),
        player_count: playersWithUrls.length,
        captain_id: formData.captain_index,
        players: playersWithUrls,
        receipt_url: receiptUrl,
        badge_url: badgeUrl,
        status: 'pending'
      }).eq('id', user?.id);

      if (dbErr) throw dbErr;
      
      updateProfile({ status: 'pending', team_name: formData.team_name.trim(), player_count: playersWithUrls.length, receipt_url: receiptUrl, badge_url: badgeUrl });
      
      localStorage.removeItem(STORAGE_KEY);
      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (err) {
      setError(err.message || 'Error al procesar.');
    } finally {
      setLoading(false);
    }
  };

  const steps = ['1. Datos del Equipo', '2. Plantilla', '3. Documentos'];

  if (success) return (
    <div className={styles.successContainer}>
      <div className={styles.successIcon}>✅</div>
      <h2>¡Inscripción Enviada!</h2>
      <p>Revisaremos tu equipo y te notificaremos cuando sea aceptado.</p>
    </div>
  );

  return (
    <div className={styles.container}>
      <Card title="📝 Inscripción del Equipo" subtitle="Completa los pasos para registrar a tu equipo">
        <div className={styles.stepper}>
          {steps.map((s, i) => (
            <div key={i} className={`${styles.step} ${i + 1 === step ? styles.active : ''} ${i + 1 < step ? styles.completed : ''}`}>
              <span className={styles.stepNum}>{i + 1 < step ? '✓' : i + 1}</span>
              <span className={styles.stepLabel}>{s}</span>
            </div>
          ))}
        </div>
        {error && <div className={styles.errorBox}>⚠️ {error}</div>}
        
        <div className={styles.formContent}>
          
          {/* ==================== PASO 1: DATOS ==================== */}
          {step === 1 && (
            <div className={styles.stepContent}>
              <Input label="Nombre del Equipo *" value={formData.team_name} onChange={e => updateField('team_name', e.target.value)} fullWidth placeholder="Ej: Club Voleibol Ejemplo" />
              <p className={styles.hint}>Este nombre aparecerá en clasificación, calendarios y transmisiones.</p>
            </div>
          )}

          {/* ==================== PASO 2: PLANTILLA ==================== */}
          {step === 2 && (
            <div className={styles.stepContent}>
              <div className={styles.sectionHeader}>
                <h3>👥 Plantilla ({formData.players.length}/12)</h3>
                <span className={`${styles.counter} ${formData.players.filter(p => p.gender === 'female').length < 2 ? styles.warning : ''}`}>
                  👩 {formData.players.filter(p => p.gender === 'female').length}/2 mín. femeninas
                </span>
              </div>
              
              <div className={styles.playersGrid}>
                {formData.players.map((p, i) => (
                  <div key={i} className={styles.playerCard}>
                    <div className={styles.playerHeader}>
                      <span className={styles.playerIndex}>Jugador #{i + 1}</span>
                      <div className={styles.playerActions}>
                        <label className={styles.captainCheck}>
                          <input type="radio" name="captain" checked={i === formData.captain_index} onChange={() => updateField('captain_index', i)} />
                          Capitán
                        </label>
                        {formData.players.length > 1 && <button type="button" onClick={() => removePlayer(i)} className={styles.removeBtn}>✕</button>}
                      </div>
                    </div>
                    
                    <div className={styles.photoUpload}>
                      {p.photo_url ? (
                        <img src={p.photo_url} alt="Preview" className={styles.photoPreview} />
                      ) : (
                        <div className={styles.photoPlaceholder}>📷</div>
                      )}
                      <input type="file" accept="image/*" onChange={e => handlePlayerPhoto(i, e.target.files?.[0])} className={styles.hiddenFile} id={`photo-${i}`} />
                      <label htmlFor={`photo-${i}`} className={styles.photoLabel}>Subir Foto</label>
                      
                      {/* ✅ NUEVO: Explicación sobre la foto y el MVP */}
                      <div className={styles.photoHint}>
                        <small>📸 <strong>Opcional:</strong> Sube foto para facilitar el reconocimiento al votar el MVP.</small>
                      </div>
                    </div>

                    <div className={styles.playerFields}>
                      <input placeholder="Nombre" value={p.name} onChange={e => updatePlayer(i, 'name', e.target.value)} className={styles.inputSmall} />
                      <input placeholder="Apellidos" value={p.surname} onChange={e => updatePlayer(i, 'surname', e.target.value)} className={styles.inputSmall} />
                      <div className={styles.genderRow}>
                        <label className={styles.genderLabel}>
                          <input type="radio" name={`gender-${i}`} value="male" checked={p.gender === 'male'} onChange={e => updatePlayer(i, 'gender', e.target.value)} />
                          👨 Masc
                        </label>
                        <label className={styles.genderLabel}>
                          <input type="radio" name={`gender-${i}`} value="female" checked={p.gender === 'female'} onChange={e => updatePlayer(i, 'gender', e.target.value)} />
                          👩 Fem
                        </label>
                      </div>
                      <input placeholder="Teléfono" type="tel" value={p.phone} onChange={e => updatePlayer(i, 'phone', e.target.value)} className={styles.inputSmall} />
                      <input placeholder="DNI/NIE" value={p.dni} onChange={e => updatePlayer(i, 'dni', e.target.value)} className={styles.inputSmall} />
                    </div>
                  </div>
                ))}
              </div>
              {formData.players.length < 12 && <Button variant="ghost" onClick={addPlayer} fullWidth className={styles.addBtn}>+ Añadir Jugador</Button>}
            </div>
          )}

          {/* ==================== PASO 3: DOCUMENTOS ==================== */}
          {step === 3 && (
            <div className={styles.stepContent}>
              
              {/* ✅ NUEVO: Tarjeta de Información Bancaria */}
              <div className={styles.bankInfoCard}>
                <div className={styles.bankHeader}>
                  <h3>🏦 Datos para el Pago</h3>
                </div>
                <p className={styles.bankText}>
                  La inscripción deberá ser ingresada en la siguiente cuenta:
                </p>
                <div className={styles.ibanBox}>
                  <span className={styles.ibanLabel}>IBAN:</span>
                  <code className={styles.ibanCode}>ES27 3023 0009 4470 1643 3901</code>
                </div>
                <div className={styles.bankDetails}>
                  <p><strong>Banco:</strong> CAJA RURAL DE GRANADA</p>
                  <p><strong>A nombre de:</strong> C.V. Baza</p>
                  <p><strong>Concepto obligatorio:</strong> <span className={styles.highlight}>24 horas voleibol + [Nombre de tu equipo]</span></p>
                </div>
              </div>

              <div className={styles.documentsGrid}>
                {/* Sección Recibo */}
                <div className={styles.fileGroup}>
                  <label className={styles.fileLabel}>📄 Recibo de Inscripción *</label>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => updateField('receipt', e.target.files?.[0])} className={styles.fileInput} />
                  {formData.receipt_url && !formData.receipt && <p className={styles.currentFile}>✅ Recibo actual subido</p>}
                  <small className={styles.errorHint}>⚠️ Sin este archivo no se podrá completar la inscripción.</small>
                </div>

                {/* Sección Escudo */}
                <div className={styles.fileGroup}>
                  <label className={styles.fileLabel}>🏐 Escudo del Equipo (Opcional)</label>
                  <input type="file" accept=".jpg,.jpeg,.png,.svg" onChange={e => updateField('badge', e.target.files?.[0])} className={styles.fileInput} />
                  {formData.badge_url && !formData.badge && <p className={styles.currentFile}>✅ Escudo actual subido</p>}
                  
                  {/* ✅ NUEVO: Explicación sobre el escudo */}
                  <div className={styles.badgeHint}>
                    <small>💡 <strong>Opcional:</strong> Sirve para una mejor visualización en clasificaciones, jornadas y marcadores.</small>
                  </div>
                </div>
              </div>

              <div className={styles.hintBox}>ℹ️ Formatos: PDF, JPG, PNG. Máx 5MB.</div>
            </div>
          )}
        </div>

        <div className={styles.actions}>
          {step > 1 && <Button variant="ghost" onClick={() => setStep(s => s - 1)}>← Anterior</Button>}
          {step < 3 ? <Button onClick={() => setStep(s => s + 1)}>Siguiente →</Button> : <Button variant="success" loading={loading} onClick={handleSubmit}>{loading ? 'Procesando...' : 'Enviar Inscripción'}</Button>}
        </div>
      </Card>
    </div>
  );
}