import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store';
import { Card } from '../design-system/components';
import styles from './MatchesView.module.css';

// ============================================================================
// ✅ FUNCIONES AUXILIARES
// ============================================================================

const parseSafeDate = (dateValue) => {
  if (!dateValue) return null;
  const normalized = String(dateValue).replace(' ', 'T');
  const dateObject = new Date(normalized);
  return isNaN(dateObject.getTime()) ? null : dateObject;
};

const formatMatchDate = (dateValue) => {
  const dateObject = parseSafeDate(dateValue);
  if (!dateObject) return 'Fecha no definida';
  
  return dateObject.toLocaleDateString('es-ES', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatTimeBadge = (dateValue) => {
  const dateObject = parseSafeDate(dateValue);
  if (!dateObject) return { time: '--:--', day: '--', month: '--' };
  
  return {
    time: dateObject.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    day: dateObject.toLocaleDateString('es-ES', { day: 'numeric' }),
    month: dateObject.toLocaleDateString('es-ES', { month: 'short' })
  };
};

// ============================================================================
// ✅ COMPONENTE PRINCIPAL
// ============================================================================

export default function MatchesView() {
  const { user } = useAuthStore();
  
  // 🔹 CORRECCIÓN 1: Inicialización perezosa para evitar el flash de "Mis Partidos"
  // Lee localStorage ANTES del primer renderizado.
  const getInitialTab = () => {
    const savedTab = localStorage.getItem('matches_active_tab');
    if (savedTab && ['my', 'live', 'finished', 'all'].includes(savedTab)) {
      return savedTab;
    }
    return 'my';
  };

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(getInitialTab);
  
  const isInitialMount = useRef(true);

  // 🔹 Carga de datos y suscripción a tiempo real
  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const { data: matchesData, error: fetchError } = await supabase
          .from('matches')
          .select(`
            *,
            home_team:profiles!matches_home_team_id_fkey(team_name, badge_url),
            away_team:profiles!matches_away_team_id_fkey(team_name, badge_url),
            referee:profiles!matches_referee_team_id_fkey(full_name, team_name)
          `)
          .order('match_date', { ascending: true });

        if (fetchError) throw fetchError;
        setMatches(matchesData || []);
      } catch (err) {
        console.error('💥 Error en fetchMatches:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMatches();

    const channel = supabase
      .channel('matches-realtime')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        (payload) => {
          setMatches(prev => prev.map(match => 
            match.id === payload.new.id ? { ...match, ...payload.new } : match
          ));
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // 🔹 Guardar pestaña activa cuando cambia
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    localStorage.setItem('matches_active_tab', activeTab);
  }, [activeTab]);

  // 🔹 Gestión de Scroll de Ventana (Persistencia al recargar)
  useEffect(() => {
    if (!isInitialMount.current) return; // Solo ejecutar en el primer montaje

    const savedScroll = localStorage.getItem('matches_scroll_position_global');
    if (savedScroll) {
      // Restaurar posición guardada
      window.scrollTo(0, parseInt(savedScroll, 10));
    }
    
    // Limpiar después de usar
    isInitialMount.current = false;
  }, []);

  // Guardar scroll en tiempo real
  useEffect(() => {
    const handleScroll = () => {
      localStorage.setItem('matches_scroll_position_global', window.scrollY.toString());
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Filtrado por pestañas
  const myMatches = matches.filter(m => 
    user && (m.home_team_id === user.id || m.away_team_id === user.id || m.referee_team_id === user.id)
  );
  const liveMatches = matches.filter(m => m.status === 'live');
  const finishedMatches = matches.filter(m => m.status === 'finished');
  
  const currentMatches = {
    my: myMatches,
    live: liveMatches,
    finished: finishedMatches,
    all: matches
  }[activeTab] || matches;

  // ============================================================================
  // ️ RENDERIZADO
  // ============================================================================

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.state}>
          <div className={styles.spinner} />
          <p>Cargando partidos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={`${styles.state} ${styles.stateError}`}>
          <span className={styles.stateIcon}>⚠️</span>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerGlow} aria-hidden="true" />
        <h1 className={styles.title}>⚡ Partidos</h1>
        <p className={styles.subtitle}>Calendario, resultados y marcadores en tiempo real</p>
      </header>

      {/* Navegación por pestañas */}
      <nav className={styles.tabsGlass} role="tablist">
        {[
          { id: 'my', label: 'Mis partidos' },
          { id: 'live', label: '🔴 En vivo', badge: liveMatches.length },
          { id: 'finished', label: 'Finalizados' },
          { id: 'all', label: 'Todos' }
        ].map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.tabGlass} ${activeTab === tab.id ? styles.tabGlassActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.badge > 0 && (
              <span className={styles.tabBadgePill}>{tab.badge}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Lista de partidos */}
      <div className={styles.matchesList} role="tabpanel">
        {currentMatches.length === 0 ? (
          <div className={`${styles.state} ${styles.stateEmpty}`}>
            <span className={styles.stateIcon}>📅</span>
            <p>No hay partidos en esta sección</p>
            <Link to="/calendario" className={styles.emptyLink}>Ver calendario completo →</Link>
          </div>
        ) : (
          currentMatches.map(match => (
            <MatchCard 
              key={match.id} 
              match={match} 
              userId={user?.id ?? null} 
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ✅ TARJETA DE PARTIDO
// ============================================================================

function MatchCard({ match, userId }) {
  const isReferee = userId && match.referee_team_id === userId;
  const isPlayer = userId && (match.home_team_id === userId || match.away_team_id === userId);
  
  const statusConfig = {
    live: { label: '● EN VIVO', variant: 'live', gradient: 'from-rose-500 to-orange-500' },
    finished: { label: '✓ FINALIZADO', variant: 'finished', gradient: 'from-emerald-500 to-teal-500' },
    scheduled: { label: '◷ PROGRAMADO', variant: 'scheduled', gradient: 'from-slate-500 to-zinc-500' }
  };
  const status = statusConfig[match.status] || statusConfig.scheduled;

  let setsHome = 0, setsAway = 0, setsDetails = [];
  try {
    if (match.sets_details) {
      const parsed = JSON.parse(match.sets_details);
      if (Array.isArray(parsed)) {
        setsDetails = parsed;
        parsed.forEach(s => {
          if (Array.isArray(s) && s.length === 2) {
            if (s[0] > s[1]) setsHome++;
            else if (s[1] > s[0]) setsAway++;
          }
        });
      }
    }
  } catch {}

  const homeTeam = {
    name: match.home_team?.team_name || 'Equipo Local',
    badge: match.home_team?.badge_url
  };
  const awayTeam = {
    name: match.away_team?.team_name || 'Equipo Visitante',
    badge: match.away_team?.badge_url
  };
  const referee = {
    name: match.referee?.full_name || match.referee?.team_name || 'Por asignar',
    team: match.referee?.team_name
  };

  const timeBadge = formatTimeBadge(match.match_date);

  return (
    <Card className={`${styles.cardPremium} ${styles[`card--${status.variant}`]}`}>
      <div className={styles.cardGlow} aria-hidden="true" />
      
      <div className={styles.cardHeader}>
        <span className={`${styles.statusBadge} ${styles[`status--${status.variant}`]}`}>
          {status.label}
        </span>
        
        <div className={styles.timeBadge}>
          <div className={styles.timeBadgeMain}>
            <span className={styles.timeValue}>{timeBadge.time}</span>
          </div>
          <div className={styles.timeBadgeDate}>
            <span className={styles.timeDay}>{timeBadge.day}</span>
            <span className={styles.timeMonth}>{timeBadge.month}</span>
          </div>
        </div>
      </div>

      <div className={styles.matchInfoBar}>
        <div className={styles.infoPill}>
          <span className={styles.infoIcon}>️</span>
          <span className={styles.infoLabel}>Pista</span>
          <span className={styles.infoValue}>
            {match.court_number ? `#${match.court_number}` : 'TBD'}
          </span>
        </div>
        
        <div className={styles.infoDivider} aria-hidden="true" />
        
        <div className={styles.infoPill}>
          <span className={styles.infoIcon}>🟥</span>
          <span className={styles.infoLabel}>Árbitro</span>
          <span className={styles.infoValueReferee} title={referee.name}>
            {referee.name.length > 18 ? referee.name.slice(0, 18) + '…' : referee.name}
          </span>
        </div>
      </div>

      <div className={styles.scoreboard}>
        <TeamDisplay 
          team={homeTeam} 
          sets={setsHome} 
          points={match.live_points_home || 0}
          isWinner={setsHome > setsAway && match.status === 'finished'}
          side="home"
        />

        <div className={styles.scoreCenter}>
          <span className={styles.vsBadge}>VS</span>
          {match.status === 'live' && (
            <div className={styles.livePulse}>
              <span className={styles.pulseDot} />
              <span className={styles.pulseRing} />
            </div>
          )}
        </div>

        <TeamDisplay 
          team={awayTeam} 
          sets={setsAway} 
          points={match.live_points_away || 0}
          isWinner={setsAway > setsHome && match.status === 'finished'}
          side="away"
        />
      </div>

      {match.status === 'finished' && setsDetails.length > 0 && (
        <div className={styles.setsDrawer}>
          <button className={styles.setsToggle}>
            <span className={styles.setsToggleLabel}>Ver resultado por sets</span>
            <span className={styles.setsToggleIcon}>▼</span>
          </button>
          <div className={styles.setsContent}>
            {setsDetails.map((set, idx) => {
              const homeWon = set[0] > set[1];
              return (
                <div key={idx} className={styles.setRow}>
                  <span className={styles.setLabel}>Set {idx + 1}</span>
                  <div className={styles.setScores}>
                    <span className={`${styles.setScore} ${homeWon ? styles.setScoreWin : ''}`}>
                      {set[0]}
                    </span>
                    <span className={styles.setDash}>•</span>
                    <span className={`${styles.setScore} ${!homeWon ? styles.setScoreWin : ''}`}>
                      {set[1]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.cardFooter}>
        <div className={styles.footerActions}>
          {isReferee && (
            <Link to={`/arbitro/partido/${match.id}`} className={styles.btnArbitrar}>
              <span className={styles.btnIcon}>⚖️</span>
              Arbitrar ahora
            </Link>
          )}
          {!isReferee && isPlayer && (
            <button className={styles.btnViewScore}>
              <span className={styles.btnIcon}>️</span>
              Ver marcador
            </button>
          )}
          {!isReferee && !isPlayer && (
            <span className={styles.btnSpectator}>👁️ Espectar</span>
          )}
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// ✅ Subcomponente: Display de Equipo
// ============================================================================

function TeamDisplay({ team, sets, points, isWinner, side }) {
  return (
    <div className={`${styles.team} ${styles[`team--${side}`]}`}>
      <div className={styles.teamBadgeWrapper}>
        <div className={styles.teamBadge}>
          {team.badge ? (
            <img src={team.badge} alt={team.name} loading="lazy" />
          ) : (
            <span className={styles.badgePlaceholder}>🏐</span>
          )}
        </div>
        {isWinner && <span className={styles.winnerCrown}>👑</span>}
      </div>
      
      <span className={styles.teamName} title={team.name}>
        {team.name}
      </span>
      
      <div className={styles.scoreGroup}>
        <div className={`${styles.setsDisplay} ${isWinner ? styles.setsDisplayWin : ''}`}>
          <span className={styles.setsLabel}>Sets</span>
          <span className={styles.setsValue}>{sets}</span>
        </div>
        <div className={styles.pointsDisplay}>
          <span className={styles.pointsValue}>{points}</span>
        </div>
      </div>
    </div>
  );
}