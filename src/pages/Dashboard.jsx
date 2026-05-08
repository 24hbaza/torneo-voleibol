import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store';
import { useGuestMode } from '../hooks/useGuestMode';
import { Badge, Button } from '../design-system/components';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const { isGuest } = useGuestMode();
  
  const isGuestView = isGuest && !user;

  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [media, setMedia] = useState({ rules: [], gallery: [], sponsors: [], announcements: [] });

  useEffect(() => {
    if (user && profile && !profile.team_name) {
      navigate('/dashboard/inscripcion', { replace: true });
    }
  }, [user, profile, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (isGuestView || user) {
          
          // ✅ 1. CONFIGURACIÓN - SINTAXIS CORRECTA: data: cfg
          const { data: cfg, error: cfgError } = await supabase
            .from('tournament_config')
            .select('*')
            .order('created_at', { ascending: false })
            .maybeSingle();

          if (cfgError) console.warn('Config error:', cfgError);
          setConfig(cfg || null);

          // ✅ 2. ANUNCIOS - SINTAXIS CORRECTA: data: newsData
          const { data: newsData, error: newsError } = await supabase
            .from('tournament_announcements')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

          if (newsError) console.warn('News error:', newsError);
          setMedia(prev => ({ ...prev, announcements: newsData || [] }));

          // ✅ 3. MEDIA (Normativa, Galería, Patrocinadores) - SINTAXIS CORRECTA: data: mediaData
          const { data: mediaData, error: mediaError } = await supabase
            .from('tournament_media')
            .select('*')
            .order('created_at', { ascending: false });

          if (mediaError) {
            console.error('❌ Error cargando media:', mediaError);
          } else {
            console.log('📦 Datos raw de media:', mediaData);
            if (mediaData && mediaData.length > 0) {
              console.table(mediaData.map(m => ({ id: m.id, title: m.title, category: m.category })));
            }

            if (Array.isArray(mediaData)) {
              setMedia(prev => ({
                ...prev,
                rules: mediaData.filter(m => m.category === 'rules'),
                gallery: mediaData.filter(m => m.category === 'gallery'),
                sponsors: mediaData.filter(m => m.category === 'sponsors')
              }));
            }
          }
        }
      } catch (err) {
        console.error('Error loading dashboard:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, isGuestView]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Cargando...</p>
      </div>
    );
  }

  if (error) {
    return <div className={styles.errorBox}>⚠️ {error}</div>;
  }

  return (
    <div className={`${styles.container} ${isGuestView ? styles.guestMode : ''}`}>
      
      {/* 📢 ANUNCIOS */}
      {media.announcements.length > 0 && (
        <div className={styles.announcementsSection}>
          {media.announcements.map(ann => (
            <div key={ann.id} className={`${styles.announcementCard} ${styles[ann.priority]}`}>
              <div className={styles.announcementHeader}>
                <h3>{ann.title}</h3>
                <small>{new Date(ann.created_at).toLocaleDateString()}</small>
              </div>
              <p>{ann.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* 🏠 HERO */}
      <section className={styles.heroSection}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadgeWrapper}>
            {isGuestView ? (
              <div className={styles.heroBadgePlaceholder}>👁️</div>
            ) : profile?.badge_url ? (
              <img src={profile.badge_url} alt="Escudo" className={styles.heroBadge} />
            ) : (
              <div className={styles.heroBadgePlaceholder}>🏐</div>
            )}
          </div>
          
          <div className={styles.heroText}>
            <h1 className={styles.heroTitle}>
              {isGuestView ? '24h Voleibol Baza' : profile?.team_name || 'Tu Equipo'}
            </h1>
            <div className={styles.heroMeta}>
              <Badge variant={isGuestView ? 'info' : (profile?.status === 'accepted' ? 'success' : 'pending')} size="sm">
                {isGuestView ? 'Espectador' : (profile?.status === 'accepted' ? '✅ Inscrito' : '⏳ Pendiente')}
              </Badge>
              {!isGuestView && <span className={styles.heroSeason}>Temporada 2026</span>}
            </div>
            <p className={styles.heroDescription}>
              {isGuestView 
                ? 'Consulta calendarios, resultados y noticias del torneo.'
                : (profile?.status === 'accepted' 
                  ? '¡Todo listo! Revisa tus partidos y la clasificación.'
                  : 'Tu inscripción está siendo revisada.')}
            </p>
          </div>
        </div>

        <div className={styles.quickActions}>
          <Link to="/dashboard/partidos" className={styles.actionBtn}>
            <span>📅</span> Partidos
          </Link>
          <Link to="/dashboard/clasificacion" className={styles.actionBtn}>
            <span>🏆</span> Clasificación
          </Link>
          {!isGuestView && profile?.status === 'accepted' && (
            <Link to="/arbitro" className={`${styles.actionBtn} ${styles.refereeBtn}`}>
              <span>🟥</span> Árbitro
            </Link>
          )}
        </div>
      </section>

      {/* ✅ REORDENADO: NORMATIVA PRIMERO */}
      <section className={styles.cleanSection}>
        <h2 className={styles.sectionTitle}>📜 Normativa</h2>
        {media.rules.length > 0 ? (
          <div className={styles.rulesList}>
            {media.rules.map((rule) => (
              <a key={rule.id} href={rule.file_url} target="_blank" rel="noopener noreferrer" className={styles.ruleLink}>
                <span>📄</span>
                <span className={styles.ruleText}>{rule.title}</span>
                <span className={styles.ruleArrow}>→</span>
              </a>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>Próximamente</p>
        )}
      </section>

      {/* ✅ REORDENADO: GALERÍA DESPUÉS */}
      <section className={styles.cleanSection}>
        <h2 className={styles.sectionTitle}>📸 Galería</h2>
        {media.gallery.length > 0 ? (
          <div className={styles.galleryCleanGrid}>
            {media.gallery.map((photo) => (
              <a key={photo.id} href={photo.file_url} target="_blank" rel="noopener noreferrer" className={styles.galleryCleanItem}>
                <img src={photo.file_url} alt={photo.title || 'Foto'} loading="lazy" />
              </a>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>Próximamente</p>
        )}
      </section>

      {/* ℹ️ INFO TORNEO */}
      <section className={styles.statusSection}>
        <div className={styles.statusCard}>
          {config?.draw_completed ? (
            <>
              <span className={styles.statusDotLive}></span>
              <div>
                <strong>Torneo en marcha</strong>
                <p>La fase de grupos está activa.</p>
              </div>
            </>
          ) : (
            <>
              <span className={styles.statusDotWaiting}></span>
              <div>
                <strong>Próximo inicio</strong>
                <p>El calendario se publicará pronto.</p>
              </div>
            </>
          )}
        </div>
      </section>

      {/* 👁️ INFO INVITADOS */}
      {isGuestView && (
        <section className={styles.guestSection}>
          <p>¿Quieres gestionar tu equipo y votar MVPs?</p>
          <div className={styles.guestActions}>
            <Link to="/register"><Button variant="primary" size="sm">Crear cuenta</Button></Link>
            <Link to="/login"><Button variant="ghost" size="sm">Iniciar sesión</Button></Link>
          </div>
        </section>
      )}

      {/* ✅ REORDENADO: ORGANIZACIÓN AL FINAL */}
      <section className={styles.cleanSection}>
        <h2 className={styles.sectionTitle}>🏛️ Organización</h2>
        <div className={styles.logosRow}>
          <div className={styles.logoItem}>
            <span className={styles.logoLabel}>Organizado por</span>
            <img src="https://i.ibb.co/Z6pdvSSZ/images.png" alt="Organizador" className={styles.cleanLogoLarge} />
          </div>
          <div className={styles.logoDivider}></div>
          <div className={styles.logoItem}>
            <span className={styles.logoLabel}>En colaboración con</span>
            <img src="https://i.ibb.co/BH3MqCVN/images-3.png" alt="Colaborador" className={styles.cleanLogoLarge} />
          </div>
        </div>
      </section>

      {/* ✅ REORDENADO: PATROCINADORES AL FINAL */}
      <section className={styles.cleanSection}>
        <h2 className={styles.sectionTitle}>Patrocinadores</h2>
        <div className={styles.sponsorsCleanGrid}>
          {media.sponsors.length > 0 ? (
            media.sponsors.map((sponsor) => (
              <a key={sponsor.id} href={sponsor.file_url} target="_blank" rel="noopener noreferrer" className={styles.sponsorCleanItem}>
                <img src={sponsor.file_url} alt={sponsor.title} className={styles.sponsorCleanLogoLarge} />
              </a>
            ))
          ) : (
            <>
              <img src="https://i.ibb.co/hxqQ41B8/images-4.jpg" alt="Sponsor" className={styles.sponsorCleanLogoLarge} />
              <img src="https://i.ibb.co/M5MXBKTP/Whats-App-Image-2026-05-06-at-23-01-22.jpg" alt="Sponsor" className={styles.sponsorCleanLogoLarge} />
              <img src="https://i.ibb.co/LzSxycBx/Captura-de-pantalla-2026-01-16-142558.png" alt="Sponsor" className={styles.sponsorCleanLogoLarge} />
            </>
          )}
        </div>
      </section>

    </div>
  );
}