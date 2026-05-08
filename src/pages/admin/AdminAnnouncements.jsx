import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Card, Button } from '../../design-system/components';
import styles from './AdminAnnouncements.module.css';

export default function AdminAnnouncements() {
  const [loading, setLoading] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ title: '', message: '', priority: 'normal', is_active: true });

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const {  data, error } = await supabase.from('tournament_announcements').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setAnnouncements(data || []);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        const { error } = await supabase.from('tournament_announcements').update(formData).eq('id', editingId);
        if (error) throw error;
        alert('✅ Noticia actualizada');
      } else {
        const { error } = await supabase.from('tournament_announcements').insert(formData);
        if (error) throw error;
        alert('✅ Noticia publicada');
      }
      setFormData({ title: '', message: '', priority: 'normal', is_active: true });
      setEditingId(null);
      fetchAnnouncements();
    } catch (err) {
      alert('❌ Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setFormData({ title: item.title, message: item.message, priority: item.priority, is_active: item.is_active });
  };

  const handleToggleActive = async (id, currentStatus) => {
    const { error } = await supabase.from('tournament_announcements').update({ is_active: !currentStatus }).eq('id', id);
    if (error) alert('❌ Error: ' + error.message);
    else fetchAnnouncements();
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta noticia permanentemente?')) return;
    const { error } = await supabase.from('tournament_announcements').delete().eq('id', id);
    if (error) alert('❌ Error: ' + error.message);
    else {
      if (editingId === id) setEditingId(null);
      fetchAnnouncements();
    }
  };

  if (loading && announcements.length === 0) return <div className={styles.loading}>Cargando...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>📢 Gestión de Mensajes Importantes</h1>
        <p>Publica noticias, avisos y recordatorios para todos los usuarios</p>
      </header>

      <Card title={editingId ? "✏️ Editar Noticia" : "➕ Nueva Noticia"}>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input type="text" placeholder="Título de la noticia" value={formData.title} onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))} className={styles.input} required />
          <textarea placeholder="Escribe el mensaje completo..." value={formData.message} onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))} className={styles.textarea} rows="4" required />
          
          <div className={styles.row}>
            <select value={formData.priority} onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))} className={styles.select}>
              <option value="low">🟢 Baja</option>
              <option value="normal">🔵 Normal</option>
              <option value="high">🟠 Alta</option>
              <option value="urgent">🔴 Urgente</option>
            </select>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))} />
              Publicar inmediatamente
            </label>
          </div>

          <div className={styles.actions}>
            <Button type="submit" variant="primary" loading={loading}>{editingId ? '💾 Guardar' : '📤 Publicar'}</Button>
            {editingId && <Button type="button" variant="ghost" onClick={() => { setEditingId(null); setFormData({ title: '', message: '', priority: 'normal', is_active: true }); }}>Cancelar</Button>}
          </div>
        </form>
      </Card>

      <div className={styles.list}>
        {announcements.length === 0 ? (
          <p className={styles.empty}>No hay mensajes publicados aún.</p>
        ) : (
          announcements.map(a => (
            <Card key={a.id} title={null} className={`${styles.announcementCard} ${!a.is_active ? styles.inactive : ''}`}>
              <div className={styles.announcementHeader}>
                <h3 className={`${styles.badge} ${styles[a.priority]}`}>{a.title}</h3>
                <div className={styles.controls}>
                  <button onClick={() => handleToggleActive(a.id, a.is_active)} title={a.is_active ? "Ocultar" : "Mostrar"}>
                    {a.is_active ? '👁️' : '🚫'}
                  </button>
                  <button onClick={() => handleEdit(a)} title="Editar">✏️</button>
                  <button onClick={() => handleDelete(a.id)} title="Eliminar" className={styles.deleteBtn}>🗑️</button>
                </div>
              </div>
              <p className={styles.announcementText}>{a.message}</p>
              <small className={styles.date}>Publicado: {new Date(a.created_at).toLocaleString()}</small>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}