// src/pages/MatchesView.jsx
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store';
import { Card } from '../design-system/components';
import styles from './MatchesView.module.css';

const parseSafeDate = (dateValue) => {
  if (!dateValue) return null;
  const normalized = String(dateValue).replace(' ', 'T');
  const dateObject = new Date(normalized);
  return isNaN(dateObject.getTime()) ? null : dateObject;
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

const PHASE_CONFIG = {
  group: { label: 'Fase de Grupos', icon: '📊', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
  playoff_group: { label: 'Playoffs', icon: '🔥', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
  playoff_semifinal: { label: 'Semifinal', icon: '⚔️', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)' },
  playoff_final: { label: '🏆 FINAL', icon: '🏆', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)', highlight: true },
  playoff_third: { label: '3º y 4º', icon: '🥉', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' }
};

const STAGE_TO_CONFIG = {
  group: PHASE_CONFIG.group,
  playoff: PHASE_CONFIG.playoff_group,
  semifinal: PHASE_CONFIG.playoff_semifinal,
  final: PHASE_CONFIG.playoff_final,
  third_place: PHASE_CONFIG.playoff_third
};

const getPhaseConfig = (match) => {
  const stage = match?.stage || 'group';
  return STAGE_TO_CONFIG[stage] || PHASE_CONFIG.group;
};

export default function MatchesView() {
  const { user } = useAuthStore();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('my');
  const isInitialMount = useRef(true);

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const { data: matchesData, error: fetchError } = await supabase
          .from('matches')
          .select(`
            *,
            stage,
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

    // ✅ Realtime: escucha TODOS los updates de la tabla matches
    const channel = supabase
      .channel('matches-realtime')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        (payload) => {
          console.log('🔄 Realtime update recibido:', payload.new.id, 'sets:', payload.new.sets_details);
          setMatches(prev => prev.map(match => 
            match.id === payload.new.id ? { ...match, ...payload.new } : match
          ));
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    localStorage.setItem('matches_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!isInitialMount.current) return;
    const savedScroll = localStorage.getItem('matches_scroll_position_global');
    if (savedScroll) {
      window.scrollTo(0, parseInt(savedScroll, 10));
    }
    isInitialMount.current = false;
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      localStorage.setItem('matches_scroll_position_global', window.scrollY.toString());
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
        <h1 className={styles.title}>Partidos</h1>
        <p className={styles.subtitle}>Calendario, resultados y marcadores en tiempo real</p>
      </header>

      <nav className={styles.tabs} role="tablist">
        {[
          { id: 'my', label: 'Mis partidos' },
          { id: 'live', label: 'En vivo', count: liveMatches.length },
          { id: 'finished', label: 'Finalizados' },
          { id: 'all', label: 'Todos' }
        ].map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.count > 0 && <span className={styles.tabCount}>{tab.count}</span>}
          </button>
        ))}
      </nav>

      <div className={styles.matchesList} role="tabpanel">
        {currentMatches.length === 0 ? (
          <div className={`${styles.state} ${styles.stateEmpty}`}>
            <span className={styles.stateIcon}>📅</span>
            <p>No hay partidos en esta sección</p>
            <Link to="/calendario" className={styles.emptyLink}>Ver calendario completo →</Link>
          </div>
        ) : (
          currentMatches.map(match => (
            <MatchCard key={match.id} match={match} userId={user?.id ?? null} />
          ))
        )}
      </div>
    </div>
  );
}

function MatchCard({ match, userId }) {
  const isReferee = userId && match.referee_team_id === userId;
  const isPlayer = userId && (match.home_team_id === userId || match.away_team_id === userId);
  
  const phaseConfig = getPhaseConfig(match);
  
  const statusConfig = {
    live: { label: 'EN VIVO', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', pulse: true },
    finished: { label: 'FINALIZADO', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', pulse: false },
    scheduled: { label: 'PROGRAMADO', color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', pulse: false }
  };
  const status = statusConfig[match.status] || statusConfig.scheduled;

  // ✅ CORRECCIÓN: Parseo robusto de sets_details (maneja string Y array)
  let setsHome = 0, setsAway = 0, setsDetails = [];
  
  if (match.sets_details) {
    try {
      if (typeof match.sets_details === 'string') {
        setsDetails = JSON.parse(match.sets_details);
      } else if (Array.isArray(match.sets_details)) {
        setsDetails = match.sets_details;
      }
      
      if (Array.isArray(setsDetails)) {
        setsDetails.forEach(s => {
          if (Array.isArray(s) && s.length === 2) {
            if (s[0] > s[1]) setsHome++;
            else if (s[1] > s[0]) setsAway++;
          }
        });
      }
    } catch (e) {
      console.warn('⚠️ Error parseando sets_details:', e);
      setsHome = match.home_score || 0;
      setsAway = match.away_score || 0;
    }
  } else {
    // Fallback si no hay sets_details
    setsHome = match.home_score || 0;
    setsAway = match.away_score || 0;
  }

  const homeTeam = {
    name: match.home_team?.team_name || 'Equipo Local',
    badge: match.home_team?.badge_url
  };
  const awayTeam = {
    name: match.away_team?.team_name || 'Equipo Visitante',
    badge: match.away_team?.badge_url
  };
  const referee = {
    name: match.referee?.full_name || match.referee?.team_name || 'Por asignar'
  };

  const timeBadge = formatTimeBadge(match.match_date);
  const isFinished = match.status === 'finished';
  const isLive = match.status === 'live';

  return (
    <Card className={`${styles.card} 
      ${phaseConfig.highlight ? styles.cardHighlight : ''} 
      ${isReferee ? styles.cardReferee : ''}`}
      style={{
        '--phase-color': phaseConfig.color,
        '--phase-bg': phaseConfig.bg,
        '--status-color': status.color,
        '--status-bg': status.bg
      }}>
      
      <div className={styles.phaseBadge} style={{ 
        backgroundColor: phaseConfig.bg,
        color: phaseConfig.color,
        borderColor: phaseConfig.color + '40'
      }}>
        <span className={styles.phaseIcon}>{phaseConfig.icon}</span>
        <span className={styles.phaseText}>{phaseConfig.label}</span>
      </div>

      {isReferee && (
        <div className={styles.refereeBadge}>
          <span className={styles.refereeBadgeIcon}>🎫</span>
          <span>Tú arbitras</span>
        </div>
      )}

      <div className={styles.cardHeader}>
        <div className={styles.statusBadge} style={{
          backgroundColor: status.bg,
          color: status.color,
          borderColor: status.color + '40'
        }}>
          {status.pulse && <span className={styles.statusPulse} />}
          {status.label}
        </div>

        <div className={styles.dateTime}>
          <span className={styles.time}>{timeBadge.time}</span>
          <span className={styles.date}>{timeBadge.day} {timeBadge.month}</span>
        </div>

        <div className={styles.courtBadge}>
          <span className={styles.courtIcon}>🏟️</span>
          <span className={styles.courtText}>Pista {match.court_number || 'TBD'}</span>
        </div>
      </div>

      <div className={styles.scoreboard}>
        <TeamDisplay 
          team={homeTeam} 
          sets={setsHome} 
          points={isLive ? (match.live_points_home || 0) : null}
          isWinner={setsHome > setsAway && isFinished}
          side="home"
        />

        <div className={styles.scoreSeparator}>
          <span className={styles.vsText}>VS</span>
          {isLive && <span className={styles.liveIndicator} aria-label="En vivo" />}
        </div>

        <TeamDisplay 
          team={awayTeam} 
          sets={setsAway} 
          points={isLive ? (match.live_points_away || 0) : null}
          isWinner={setsAway > setsHome && isFinished}
          side="away"
        />
      </div>

      {isFinished && setsDetails.length > 0 && (
        <details className={styles.setsDetails}>
          <summary className={styles.setsSummary}>
            <span>Resultado por sets</span>
            <span className={styles.setsArrow}>▾</span>
          </summary>
          <div className={styles.setsList}>
            {setsDetails.map((set, idx) => {
              const homeWon = set[0] > set[1];
              return (
                <div key={idx} className={styles.setRow}>
                  <span className={styles.setNumber}>Set {idx + 1}</span>
                  <div className={styles.setScores}>
                    <span className={`${styles.setScore} ${homeWon ? styles.setScoreWinner : ''}`}>
                      {set[0]}
                    </span>
                    <span className={styles.setDivider}>-</span>
                    <span className={`${styles.setScore} ${!homeWon ? styles.setScoreWinner : ''}`}>
                      {set[1]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      <div className={styles.refereeInfo}>
        <span className={styles.refereeLabel}>Árbitro:</span>
        <span className={styles.refereeName}>{referee.name}</span>
      </div>

      <div className={styles.cardActions}>
        {isReferee && (
          <Link to={`/arbitro/partido/${match.id}`} className={styles.btnPrimary}>
            ⚖️ Arbitrar partido
          </Link>
        )}
        {!isReferee && isPlayer && (
          <button className={styles.btnSecondary}>📊 Ver detalles</button>
        )}
        {!isReferee && !isPlayer && (
          <span className={styles.btnSpectator}>👁️ Ver como espectador</span>
        )}
      </div>
    </Card>
  );
}

function TeamDisplay({ team, sets, points, isWinner, side }) {
  return (
    <div className={`${styles.team} ${styles[`team${side.charAt(0).toUpperCase() + side.slice(1)}`]}`}>
      <div className={styles.teamBadgeContainer}>
        <div className={styles.teamBadge}>
          {team.badge ? (
            <img src={team.badge} alt={team.name} loading="lazy" style={{ objectFit: 'contain' }} />
          ) : (
            <span className={styles.badgePlaceholder}>🏐</span>
          )}
        </div>
        {isWinner && <span className={styles.winnerBadge}>🏆</span>}
      </div>
      
      <span className={styles.teamName} title={team.name}>{team.name}</span>
      
      <div className={styles.scoreContainer}>
        <div className={`${styles.setsScore} ${isWinner ? styles.setsScoreWinner : ''}`}>
          <span className={styles.setsLabel}>Sets</span>
          <span className={styles.setsNumber}>{sets}</span>
        </div>
        {points !== null && (
          <div className={styles.pointsScore}>
            <span className={styles.pointsNumber}>{points}</span>
          </div>
        )}
      </div>
    </div>
  );
}