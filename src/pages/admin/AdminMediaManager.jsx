import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Card, Button } from '../../design-system/components';
import styles from './AdminMediaManager.module.css';

export default function AdminMediaManager() {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [media, setMedia] = useState({ rules: [], gallery: [], sponsors: [] });
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    category: 'gallery',
    title: '',
    description: '',
    file: null,
    currentUrl: ''
  });

  useEffect(() => {
    fetchMedia();
  }, []);

  const fetchMedia = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tournament_media')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setMedia({
        rules: data?.filter(m => m.category === 'rules') || [],
        gallery: data?.filter(m => m.category === 'gallery') || [],
        sponsors: data?.filter(m => m.category === 'sponsors') || []
      });
    } catch (err) {
      console.error('Error fetching media:', err);
      alert('❌ Error cargando archivos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setFormData({
      category: item.category,
      title: item.title,
      description: item.description || '',
      file: null,
      currentUrl: item.file_url
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({ category: 'gallery', title: '', description: '', file: null, currentUrl: '' });
  };

  const handleFileChange = (e) => {
    setFormData(prev => ({ ...prev, file: e.target.files[0] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);
    try {
      let finalUrl = formData.currentUrl;
      
      if (formData.file) {
        const folder = formData.category === 'rules' ? 'rules' : 
                       formData.category === 'sponsors' ? 'sponsors' : 'gallery';
        const fileExt = formData.file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${folder}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('tournament-media')
          .upload(filePath, formData.file, { upsert: false });

        if (uploadError) throw uploadError;

        // ✅ MÉTODO 1: Oficial de Supabase
        const { publicUrl: officialUrl } = supabase.storage.from('tournament-media').getPublicUrl(filePath);
        
        // ✅ MÉTODO 2: Fallback manual si el bucket no está marcado como público en la UI
        finalUrl = officialUrl;
        if (!finalUrl) {
          const baseUrl = import.meta.env.VITE_SUPABASE_URL || supabase.auth.supabaseUrl || 'https://tu-proyecto.supabase.co';
          finalUrl = `${baseUrl}/storage/v1/object/public/tournament-media/${filePath}`;
          console.warn('⚠️ Bucket privado. Usando URL manual. Activa "Public bucket" en Supabase > Storage para evitar advertencias.');
        }
        
        if (!finalUrl) throw new Error('No se pudo generar la URL del archivo.');
      } else if (!editingId) {
        throw new Error('Debes seleccionar un archivo para subir.');
      }

      const payload = {
        title: formData.title || (formData.file ? formData.file.name : 'Sin título'),
        description: formData.description,
        file_url: finalUrl,
        file_type: formData.category === 'rules' ? 'pdf' : 'image',
        category: formData.category
      };

      if (editingId) {
        const { error: updateError } = await supabase.from('tournament_media').update(payload).eq('id', editingId);
        if (updateError) throw updateError;
        alert('✅ Archivo actualizado correctamente');
      } else {
        const { error: insertError } = await supabase.from('tournament_media').insert(payload);
        if (insertError) throw insertError;
        alert('✅ Archivo subido correctamente');
      }

      handleCancelEdit();
      fetchMedia();
    } catch (err) {
      console.error('Error:', err);
      alert('❌ Error: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id, filePath) => {
    if (!confirm('¿Estás seguro de eliminar este archivo? Esta acción no se puede deshacer.')) return;

    try {
      const path = filePath.includes('tournament-media/') ? filePath.split('tournament-media/')[1] : filePath;
      const { error: storageError } = await supabase.storage.from('tournament-media').remove([path]);
      if (storageError) console.warn('Warning removing from storage:', storageError.message);

      const { error: dbError } = await supabase.from('tournament_media').delete().eq('id', id);
      if (dbError) throw dbError;

      alert('✅ Archivo eliminado');
      if (editingId === id) handleCancelEdit();
      fetchMedia();
    } catch (err) {
      console.error('Error deleting file:', err);
      alert('❌ Error al eliminar: ' + err.message);
    }
  };

  const getCategoryName = (cat) => {
    const names = { rules: '📜 Normativa', gallery: '📸 Galería', sponsors: '🤝 Patrocinadores' };
    return names[cat] || cat;
  };

  if (loading) return <div className={styles.loading}>Cargando archivos...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>📁 Gestión de Contenido</h1>
        <p>Sube, edita o elimina normativa, fotos de la galería y logos de patrocinadores</p>
      </header>

      <Card title={editingId ? "✏️ Editar Archivo" : "📤 Subir Nuevo Archivo"}>
        <form onSubmit={handleSubmit} className={styles.uploadForm}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Tipo de Contenido</label>
              <select value={formData.category} onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value, file: null }))} className={styles.select}>
                <option value="gallery">📸 Galería de Fotos</option>
                <option value="rules">📜 Normativa (PDF)</option>
                <option value="sponsors">🤝 Patrocinadores</option>
              </select>
            </div>

            <div className={styles.field}>
              <label>Título</label>
              <input type="text" value={formData.title} onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))} placeholder="Ej: Final del torneo" className={styles.input} />
            </div>

            <div className={styles.field}>
              <label>Descripción</label>
              <input type="text" value={formData.description} onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))} placeholder="Breve descripción" className={styles.input} />
            </div>

            <div className={styles.field}>
              <label>Archivo {editingId && '(Dejar vacío para mantener el actual)'}</label>
              <input type="file" accept={formData.category === 'rules' ? '.pdf' : 'image/*'} onChange={handleFileChange} className={styles.fileInput} required={!editingId} />
              {formData.currentUrl && <small className={styles.hint}>Actual: {formData.currentUrl.split('/').pop()}</small>}
            </div>
          </div>

          <div className={styles.actions}>
            <Button type="submit" variant="primary" loading={uploading} disabled={uploading}>
              {uploading ? 'Procesando...' : (editingId ? '💾 Guardar Cambios' : '📤 Subir Archivo')}
            </Button>
            {editingId && <Button type="button" variant="ghost" onClick={handleCancelEdit}>Cancelar</Button>}
          </div>
        </form>
      </Card>

      {['rules', 'gallery', 'sponsors'].map(category => (
        media[category].length > 0 && (
          <Card key={category} title={getCategoryName(category)}>
            <div className={styles.mediaList}>
              {media[category].map((item) => (
                <div key={item.id} className={styles.mediaItem}>
                  {category === 'gallery' || category === 'sponsors' ? (
                    <img src={item.file_url} alt={item.title} className={styles.preview} />
                  ) : (
                    <div className={styles.pdfPreview}>📄</div>
                  )}
                  <div className={styles.mediaInfo}>
                    <h4>{item.title}</h4>
                    {item.description && <p>{item.description}</p>}
                    <small>Subido: {new Date(item.created_at).toLocaleDateString()}</small>
                  </div>
                  <div className={styles.mediaActions}>
                    <a href={item.file_url} target="_blank" rel="noopener noreferrer" download><Button variant="ghost" size="sm">⬇️</Button></a>
                    <Button variant="warning" size="sm" onClick={() => handleEdit(item)}>✏️</Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(item.id, item.file_url)}>🗑️</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )
      ))}
    </div>
  );
}