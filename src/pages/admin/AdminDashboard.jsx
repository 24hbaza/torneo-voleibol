import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Card, Badge, Button } from '../../design-system/components';
import styles from './AdminDashboard.module.css';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ teams: 0, pending: 0, matches: 0, config: null });
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { count: teamsCount, error: tErr } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: pendingCount, error: pErr } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      const { count: matchesCount, error: mErr } = await supabase.from('matches').select('*', { count: 'exact', head: true });
      const {  cfg, error: cErr } = await supabase.from('tournament_config').select('*').order('created_at', { ascending: false }).limit(1).single();

      if (tErr) console.warn('Teams count error:', tErr);
      if (pErr) console.warn('Pending count error:', pErr);
      if (mErr) console.warn('Matches count error:', mErr);
      if (cErr && cErr.code !== 'PGRST116') console.warn('Config error:', cErr);

      setStats({ teams: teamsCount || 0, pending: pendingCount || 0, matches: matchesCount || 0, config: cfg });
    } catch (err) {
      console.error('Error cargando stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleResetTournament = async () => {
    const confirm1 = window.confirm("⚠️ ATENCIÓN: Esto eliminará todos los partidos, grupos y el sorteo actual.\n\nLos equipos seguirán inscritos, pero perderán su asignación de grupo.\n\n¿Deseas continuar?");
    if (!confirm1) return;
    const confirm2 = window.confirm("⛔ ¿ESTÁS COMPLETAMENTE SEGURO?\nEsta acción es IRREVERSIBLE.");
    if (!confirm2) return;

    setResetting(true);
    try {
      const safeId = '00000000-0000-0000-0000-000000000000';
      const { error: e1 } = await supabase.from('matches').delete().neq('id', safeId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('group_assignments').delete().neq('id', safeId);
      if (e2) throw e2;
      const { error: e3 } = await supabase.from('tournament_config').update({ draw_completed: false }).neq('id', safeId);
      if (e3) throw e3;
      alert("✅ Torneo reiniciado con éxito.");
      fetchData();
    } catch (err) {
      console.error(err);
      alert("❌ Error: " + err.message);
    } finally {
      setResetting(false);
    }
  };

  if (loading) return <div className={styles.loading}>Cargando datos de administración...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>🛡️ Panel de Control</h1>
        <Badge variant={stats.config?.draw_completed ? 'success' : 'pending'}>
          {stats.config?.draw_completed ? 'Torneo Activo' : 'En Configuración'}
        </Badge>
      </header>

      <div className={styles.statsGrid}>
        <Card><div className={styles.statCard}><h3>{stats.teams}</h3><p>Equipos Totales</p></div></Card>
        <Card><div className={styles.statCard}><h3 style={{color:'var(--volley-gold)'}}>{stats.pending}</h3><p>Pendientes de Revisión</p></div></Card>
        <Card><div className={styles.statCard}><h3>{stats.matches}</h3><p>Partidos Generados</p></div></Card>
      </div>

      <div className={styles.actionsGrid}>
        <Link to="/admin/teams" className={`${styles.actionCard} ${styles.primary}`}>
          <span className={styles.icon}>👥</span><div className={styles.info}><h3>Gestión de Equipos</h3><p>Aprobar inscripciones y ver documentos.</p></div><span className={styles.arrow}>→</span>
        </Link>
        <Link to="/admin/config" className={`${styles.actionCard} ${styles.secondary}`}>
          <span className={styles.icon}>⚙️</span><div className={styles.info}><h3>Configuración</h3><p>Fechas, reglas y formato del torneo.</p></div><span className={styles.arrow}>→</span>
        </Link>
        <Link to="/admin/draw" className={`${styles.actionCard} ${styles.accent}`}>
          <span className={styles.icon}>🎲</span><div className={styles.info}><h3>Sorteo y Calendario</h3><p>Generar grupos y horarios automáticamente.</p></div><span className={styles.arrow}>→</span>
        </Link>
        <Link to="/admin/matches" className={`${styles.actionCard} ${styles.infoCard}`}>
          <span className={styles.icon}>📋</span><div className={styles.info}><h3>Gestión de Partidos</h3><p>Ver códigos de árbitro y estados.</p></div><span className={styles.arrow}>→</span>
        </Link>
        <Link to="/admin/media" className={`${styles.actionCard} ${styles.accent}`}>
          <span className={styles.icon}>📁</span><div className={styles.info}><h3>Galería y Documentos</h3><p>Subir normativa, fotos y patrocinadores.</p></div><span className={styles.arrow}>→</span>
        </Link>
        <Link to="/admin/announcements" className={`${styles.actionCard} ${styles.primary}`}>
          <span className={styles.icon}>📢</span><div className={styles.info}><h3>Mensajes Importantes</h3><p>Publicar noticias y avisos oficiales.</p></div><span className={styles.arrow}>→</span>
        </Link>
        <Link to="/admin/mvp" className={`${styles.actionCard} ${styles.mvpCard}`}>
          <span className={styles.icon}>🏆</span><div className={styles.info}><h3>Clasificación MVP</h3><p>Ranking de jugadores más valiosos por género.</p></div><span className={styles.arrow}>→</span>
        </Link>
        <Link to="/admin/playoffs" className={`${styles.actionCard} ${styles.bracketCard}`}>
          <span className={styles.icon}>🌳</span><div className={styles.info}><h3>Fase Eliminatoria</h3><p>Gestionar brackets y finales.</p></div><span className={styles.arrow}>→</span>
        </Link>
      </div>

      <div className={styles.dangerZone}>
        <h3>⚠️ Zona de Peligro</h3>
        <p>Estas acciones borran datos permanentemente y no se pueden deshacer.</p>
        <div className={styles.dangerActions}>
          <Button variant="danger" onClick={handleResetTournament} loading={resetting} disabled={resetting}>
            🗑️ Reiniciar Torneo (Mantener Equipos)
          </Button>
        </div>
      </div>
    </div>
  );
}