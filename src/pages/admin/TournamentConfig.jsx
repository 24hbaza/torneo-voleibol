// src/pages/admin/TournamentConfig.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Input, Button, Badge } from '../../design-system/components';
import styles from './TournamentConfig.module.css';

// ✅ UTILIDADES PARA MANEJO DE TIMEZONE
const toLocalInput = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
};

const toUtcIso = (localDatetimeStr) => {
  if (!localDatetimeStr) return null;
  // "2024-06-15T16:00" -> Date en zona local -> ISO en UTC
  const [datePart, timePart] = localDatetimeStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const localDate = new Date(year, month - 1, day, hour, minute);
  return localDate.toISOString();
};

export default function TournamentConfig() {
  const [config, setConfig] = useState({
    id: '',
    name: 'Torneo Voley 2026',
    start_datetime: '',
    registration_deadline: '',
    num_groups: 2,
    teams_per_group: 4,
    num_courts: 3,
    match_duration_minutes: 45,
    buffer_minutes: 10,
    points_to_win: 25,
    sets_to_win: 2,
    match_format: 'double',
    teams_advancing: 2,
    draw_completed: false
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      const response = await supabase
        .from('tournament_config')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const data = response.data;
      const error = response.error;
      
      if (error && error.code !== 'PGRST116') {
        console.error('Fetch config error:', error);
      }
      if (data) {
        setConfig({
          ...data,
          // ✅ CORRECCIÓN: Convertir UTC -> Local para el input
          start_datetime: toLocalInput(data.start_datetime),
          registration_deadline: toLocalInput(data.registration_deadline)
        });
      }
      setLoading(false);
    };
    fetchConfig();
  }, []);

  const handleChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // ✅ CORRECCIÓN: Convertir Local -> UTC para guardar en BD
      const payload = {
        name: config.name,
        start_datetime: toUtcIso(config.start_datetime),
        registration_deadline: toUtcIso(config.registration_deadline),
        num_groups: Number(config.num_groups) || 1,
        teams_per_group: Number(config.teams_per_group) || 2,
        num_courts: Number(config.num_courts) || 1,
        match_duration_minutes: Number(config.match_duration_minutes) || 45,
        buffer_minutes: Number(config.buffer_minutes) || 0,
        points_to_win: Number(config.points_to_win) || 25,
        sets_to_win: Number(config.sets_to_win) || 2,
        match_format: config.match_format,
        teams_advancing: Number(config.teams_advancing) || 2
      };

      if (config.id) payload.id = config.id;

      const response = await supabase
        .from('tournament_config')
        .upsert(payload, { onConflict: 'id' })
        .select();
      
      const data = response.data;
      const error = response.error;
      
      if (error) throw new Error(error.message);
      
      alert('✅ Configuración guardada correctamente');
      if (data && data.length > 0 && !config.id) {
        setConfig(prev => ({ ...prev, id: data[0].id }));
      }
    } catch (err) {
      console.error('Save error:', err);
      alert('❌ Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className={styles.loading}>Cargando configuración...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>⚙️ Configuración del Torneo</h1>
        {config.draw_completed && <Badge variant="success">✅ Sorteo ya realizado</Badge>}
      </header>

      {config.draw_completed && (
        <div className={styles.warningBox}>
          ⚠️ El sorteo ya se ha ejecutado. Modificar la configuración podría generar inconsistencias.
        </div>
      )}

      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
        
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>📅 Fechas y General</h2>
          <div className={styles.grid}>
            <Input label="Nombre del Torneo" value={config.name} onChange={e => handleChange('name', e.target.value)} fullWidth placeholder="Ej: Copa Verano 2026" />
            <Input label="Fecha y Hora de Inicio" type="datetime-local" value={config.start_datetime} onChange={e => handleChange('start_datetime', e.target.value)} />
            <Input label="Fecha Límite de Inscripción" type="datetime-local" value={config.registration_deadline} onChange={e => handleChange('registration_deadline', e.target.value)} />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>🏟️ Formato y Logística</h2>
          <div className={styles.grid}>
            <Input label="Número de Grupos" type="number" min="1" max="8" value={config.num_groups} onChange={e => handleChange('num_groups', e.target.value)} />
            <Input label="Equipos por Grupo" type="number" min="2" max="12" value={config.teams_per_group} onChange={e => handleChange('teams_per_group', e.target.value)} />
            <Input label="Número de Pistas" type="number" min="1" max="10" value={config.num_courts} onChange={e => handleChange('num_courts', e.target.value)} />
            <Input label="Duración Partido (min)" type="number" min="15" value={config.match_duration_minutes} onChange={e => handleChange('match_duration_minutes', e.target.value)} />
            <Input label="Tiempo entre Partidos (min)" type="number" min="0" value={config.buffer_minutes} onChange={e => handleChange('buffer_minutes', e.target.value)} />
            <div className={styles.field}>
              <label className={styles.label}>Formato de Partidos</label>
              <select className={styles.select} value={config.match_format} onChange={e => handleChange('match_format', e.target.value)}>
                <option value="single">🔹 Solo Ida</option>
                <option value="double">🔄 Ida y Vuelta</option>
              </select>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>🎯 Reglas y Clasificación</h2>
          <div className={styles.grid}>
            <Input label="Puntos para ganar set" type="number" min="1" value={config.points_to_win} onChange={e => handleChange('points_to_win', e.target.value)} />
            <Input label="Sets para ganar partido" type="number" min="1" max="5" value={config.sets_to_win} onChange={e => handleChange('sets_to_win', e.target.value)} />
            <Input label="Equipos que clasifican por grupo" type="number" min="1" value={config.teams_advancing} onChange={e => handleChange('teams_advancing', e.target.value)} />
          </div>
        </section>

        <div className={styles.footer}>
          <Button type="submit" variant="primary" loading={saving} fullWidth>💾 Guardar Configuración</Button>
        </div>
      </form>
    </div>
  );
}