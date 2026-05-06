// src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store';
import { Card, Badge } from '../design-system/components';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const { profile, user } = useAuthStore();
  const [config, setConfig] = useState(null);
  const [stats, setStats] = useState({ matches: 0, wins: 0, setsFor: 0, setsAgainst: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.id) {
        setLoading(false);
        return;
      }
      
      try {
        const {  cfg } = await supabase
          .from('tournament_config')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        setConfig(cfg);

        if (cfg?.draw_completed && profile.status === 'accepted') {
          const {  matches } = await supabase
            .from('matches')
            .select('home_team_id, away_team_id, home_score, away_score, status')
            .or(`home_team_id.eq.${profile.id},away_team_id.eq.${profile.id}`)
            .eq('status', 'finished');

          let m = 0, w = 0, sf = 0, sa = 0;
          matches?.forEach(match => {
            m++;
            const myScore = match.home_team_id === profile.id ? match.home_score : match.away_score;
            const oppScore = match.home_team_id === profile.id ? match.away_score : match.home_score;
            sf += myScore;
            sa += oppScore;
            if (myScore > oppScore) w++;
          });
          setStats({ matches: m, wins: w, setsFor: sf, setsAgainst: sa });
        }
      } catch (err) {
        console.error('Error loading dashboard:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [profile]);

  if (!user || !profile) {
    return <div className={styles.loading}>Cargando perfil...</div>;
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Preparando tu dashboard...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* HERO: Perfil del Equipo */}
      <section className={styles.heroCard}>
        <div className={styles.heroContent}>
          <div className={styles.badgeWrapper}>
            {profile.badge_url ? (
              <img src={profile.badge_url} alt="Escudo" className={styles.heroBadge} />
            ) : (
              <div className={styles.heroBadgePlaceholder}>🏐</div>
            )}
            <div className={styles.badgeRing}></div>
          </div>
          
          <div className={styles.heroInfo}>
            <h1 className={styles.heroTitle}>{profile.team_name || 'Tu Equipo'}</h1>
            <div className={styles.heroMeta}>
              <Badge variant={profile.status === 'accepted' ? 'success' : 'pending'} size="lg">
                {profile.status === 'accepted' ? '✅ Aceptado' : ' Pendiente'}
              </Badge>
              <span className={styles.divider}>•</span>
              <span className={styles.metaText}>Temporada 2026</span>
            </div>
            <p className={styles.heroDescription}>
              {profile.status === 'accepted' 
                ? '¡Listo para competir! Revisa tu calendario y estadísticas.'
                : 'Tu inscripción está siendo revisada por la organización.'}
            </p>
          </div>
        </div>

        {/* Stats Rápidas en Hero */}
        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <span className={styles.heroStatNum}>{stats.matches}</span>
            <span className={styles.heroStatLabel}>PJ</span>
          </div>
          <div className={styles.heroStat}>
            {/* ✅ CORREGIDO: Interpolación correcta de clases CSS Modules */}
            <span className={`${styles.heroStatNum} ${styles.wins}`}>{stats.wins}</span>
            <span className={styles.heroStatLabel}>Victorias</span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroStatNum}>{stats.setsFor}</span>
            <span className={styles.heroStatLabel}>Sets +</span>
          </div>
        </div>
      </section>

      {/* SECCIONES PRINCIPALES */}
      <div className={styles.sectionsGrid}>
        
        {/* Calendario */}
        <Link to="/dashboard/partidos" className={`${styles.sectionCard} ${styles.sectionMatches}`}>
          <div className={styles.sectionIcon}>📅</div>
          <div className={styles.sectionInfo}>
            <h3>Mis Partidos</h3>
            <p>Calendario, horarios y marcadores en vivo</p>
          </div>
          <div className={styles.sectionArrow}>→</div>
        </Link>

        {/* Clasificación */}
        <Link to="/dashboard/clasificacion" className={`${styles.sectionCard} ${styles.sectionStandings}`}>
          <div className={styles.sectionIcon}>🏆</div>
          <div className={styles.sectionInfo}>
            <h3>Clasificación</h3>
            <p>Tablas de grupos y estadísticas</p>
          </div>
          <div className={styles.sectionArrow}>→</div>
        </Link>

        {/* Acceso Árbitro (Solo si aceptado) */}
        {profile.status === 'accepted' && (
          <Link to="/arbitro" className={`${styles.sectionCard} ${styles.sectionReferee}`}>
            <div className={styles.sectionIcon}>🟥</div>
            <div className={styles.sectionInfo}>
              <h3>Zona Árbitro</h3>
              <p>Control de marcadores en vivo</p>
            </div>
            <div className={styles.sectionArrow}>→</div>
          </Link>
        )}

        {/* Completar Inscripción (Si falta) */}
        {!profile.team_name && (
          <Link to="/dashboard/inscripcion" className={`${styles.sectionCard} ${styles.sectionInscription}`}>
            <div className={styles.sectionIcon}>📝</div>
            <div className={styles.sectionInfo}>
              <h3>Completar Inscripción</h3>
              <p>Sube documentos y datos del equipo</p>
            </div>
            <div className={styles.sectionArrow}>→</div>
          </Link>
        )}
      </div>

      {/* ESTADO DEL TORNEO */}
      <Card title={config?.draw_completed ? " Estado del Torneo" : " Información"}>
        <div className={styles.tournamentStatus}>
          {config?.draw_completed ? (
            <>
              <div className={styles.statusIndicatorLive}></div>
              <div>
                <h4>Torneo en Marcha</h4>
                <p>La fase de grupos está activa. ¡A por la victoria!</p>
              </div>
            </>
          ) : (
            <>
              <div className={styles.statusIndicatorWaiting}></div>
              <div>
                <h4>Esperando Sorteo</h4>
                <p>La organización publicará el calendario oficial pronto.</p>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}