import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store';
import { Card, Button } from '../design-system/components';
import styles from './RefereeScoreboard.module.css';

// ============================================================================
// ✅ FUNCIÓN SEGURA PARA PARSEAR FECHAS
// ============================================================================
const parseSafeDate = function(dateValue) {
  if (!dateValue) {
    return null;
  }
  const normalized = String(dateValue).replace(' ', 'T');
  const d = new Date(normalized);
  if (isNaN(d.getTime())) {
    return null;
  }
  return d;
};

// ============================================================================
// ✅ FUNCIÓN PARA SALIR DE PANTALLA COMPLETA
// ============================================================================
const exitFullscreenMode = async function() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
  } catch (err) {
    console.warn('Error al salir de fullscreen:', err);
  }
};

// ============================================================================
// ✅ COMPONENTE PRINCIPAL
// ============================================================================
export default function RefereeScoreboard() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [match, setMatch] = useState(null);
  const [homeTeam, setHomeTeam] = useState(null);
  const [awayTeam, setAwayTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);
  
  const [setsData, setSetsData] = useState({ 
    homeWon: 0, 
    awayWon: 0, 
    details: [], 
    current: 1 
  });
  
  const [showMVPModal, setShowMVPModal] = useState(false);
  const [mvpVotes, setMvpVotes] = useState({ male: '', female: '', malePhoto: '', femalePhoto: '' });
  const [submittingMVP, setSubmittingMVP] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ============================================================================
  // 🔄 CARGA DE DATOS + REALTIME
  // ============================================================================
  useEffect(function() {
    const fetchMatchData = async function() {
      try {
        const { data: matchData, error: matchError } = await supabase
          .from('matches')
          .select(`
            *,
            home_team:profiles!matches_home_team_id_fkey(team_name, badge_url, players),
            away_team:profiles!matches_away_team_id_fkey(team_name, badge_url, players)
          `)
          .eq('id', matchId)
          .maybeSingle();

        if (matchError) {
          throw matchError;
        }
        if (!matchData) {
          throw new Error('Partido no encontrado');
        }

        setMatch(matchData);
        setHomeTeam(matchData.home_team);
        setAwayTeam(matchData.away_team);
        
        // ✅ Los sets se calcularán en el useEffect derivado
      } catch (err) {
        console.error('Error fetching match:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchMatchData();

    // ✅ REALTIME: Escucha cambios en la tabla matches
    const channel = supabase
      .channel('match-' + matchId + '-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: 'id=eq.' + matchId },
        function(payload) {
          // Solo actualizamos el estado match, los sets se recalculan en el efecto derivado
          setMatch(function(prev) {
            if (!prev) {
              return prev;
            }
            return { ...prev, ...payload.new };
          });
        }
      )
      .subscribe();

    return function() {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  // ============================================================================
  // 🔁 EFECTO DERIVADO: Recalcula setsData cuando match cambie (incluido realtime)
  // ============================================================================
  useEffect(function() {
    if (!match) return;
    
    let details = [];
    try {
      if (match.sets_details) {
        const parsed = JSON.parse(match.sets_details);
        if (Array.isArray(parsed)) {
          details = parsed;
        }
      }
    } catch (e) {
      details = [];
    }
    
    const homeWon = details.filter(function(s) {
      return Array.isArray(s) && s[0] > s[1];
    }).length;
    
    const awayWon = details.filter(function(s) {
      return Array.isArray(s) && s[1] > s[0];
    }).length;
    
    setSetsData({ 
      homeWon: homeWon, 
      awayWon: awayWon, 
      details: details, 
      current: match.current_set || 1 
    });
  }, [match]); // 👈 Se ejecuta cada vez que 'match' cambie

  // ============================================================================
  // 📺 PANTALLA COMPLETA / HORIZONTAL
  // ============================================================================
  const toggleFullscreen = async function() {
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape');
        }
        setIsFullscreen(true);
      } catch (err) {
        console.warn('Fullscreen/Orientation failed:', err);
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape');
          setIsFullscreen(true);
        }
      }
    } else {
      try {
        await document.exitFullscreen();
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
        setIsFullscreen(false);
      } catch (err) {
        console.warn('Exit fullscreen failed:', err);
      }
    }
  };

  // ============================================================================
  // 📅 FORMATO DE FECHA Y HORA
  // ============================================================================
  const getCourt = function() {
    if (match && match.court_number) {
      return 'Pista ' + match.court_number;
    }
    return 'Por definir';
  };
  
  const getFormattedDate = function() {
    const d = parseSafeDate(match && match.match_date ? match.match_date : null);
    if (!d) {
      return 'No especificada';
    }
    return d.toLocaleDateString('es-ES', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
  };

  const getFormattedTime = function() {
    const d = parseSafeDate(match && match.match_date ? match.match_date : null);
    if (!d) {
      return '--:--';
    }
    return d.toLocaleTimeString('es-ES', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // ============================================================================
  // ⚡ ACTUALIZAR PUNTOS (Y CAMBIAR STATUS A 'live' SI ES EL PRIMER PUNTO)
  // ============================================================================
  const updatePoints = async function(team, newPoints) {
    if (updating || newPoints < 0) {
      return;
    }
    setUpdating(true);
    try {
      const field = team === 'home' ? 'live_points_home' : 'live_points_away';
      
      const updateData = { [field]: newPoints };
      if (match && match.status === 'scheduled') {
        updateData.status = 'live';
      }
      
      const { error: updateError } = await supabase
        .from('matches')
        .update(updateData)
        .eq('id', matchId);
      
      if (updateError) {
        throw updateError;
      }
      
      // ✅ No hace falta actualizar match manualmente, el realtime lo hará
    } catch (err) {
      setError('Error al actualizar puntos');
    } finally {
      setUpdating(false);
    }
  };

  // ============================================================================
  // 🏁 FINALIZAR SET (Y MARCAR COMO 'finished' SI ES EL ÚLTIMO)
  // ============================================================================
  const finishSet = async function() {
    if (updating) {
      return;
    }
    const homePts = match.live_points_home || 0;
    const awayPts = match.live_points_away || 0;
    
    if (homePts === awayPts) {
      setError('⚠️ Ajusta puntos para desempatar');
      return;
    }

    setUpdating(true);
    try {
      const winner = homePts > awayPts ? 'home' : 'away';
      const newDetails = [...setsData.details, [homePts, awayPts]];
      const newHomeWon = winner === 'home' ? setsData.homeWon + 1 : setsData.homeWon;
      const newAwayWon = winner === 'away' ? setsData.awayWon + 1 : setsData.awayWon;
      const setsToWin = match.sets_to_win || 3;
      const isMatchOver = newHomeWon >= setsToWin || newAwayWon >= setsToWin;

      const dbUpdate = {
        sets_details: JSON.stringify(newDetails),
        current_set: isMatchOver ? setsData.current : setsData.current + 1,
        live_points_home: isMatchOver ? homePts : 0,
        live_points_away: isMatchOver ? awayPts : 0,
        home_score: isMatchOver ? newHomeWon : (match.home_score || 0),
        away_score: isMatchOver ? newAwayWon : (match.away_score || 0),
        status: isMatchOver ? 'finished' : (match.status === 'scheduled' ? 'live' : match.status)
      };

      const { error: setUpdateError } = await supabase
        .from('matches')
        .update(dbUpdate)
        .eq('id', matchId);
      
      if (setUpdateError) {
        throw setUpdateError;
      }

      // ✅ No hace falta actualizar setsData manualmente, el efecto derivado lo hará
      // ✅ No hace falta actualizar match manualmente, el realtime lo hará
      
      // Si el partido terminó, salimos de fullscreen y mostramos MVPs
      if (isMatchOver) {
        await exitFullscreenMode();
        setIsFullscreen(false);
        setShowMVPModal(true);
      }
    } catch (err) {
      setError('Error al registrar set');
    } finally {
      setUpdating(false);
    }
  };

  // ============================================================================
  // 🏆 GUARDAR MVPs - ACTUALIZA TODOS LOS CAMPOS EN LA BASE DE DATOS
  // ============================================================================
  const submitMVPs = async function() {
    if (!mvpVotes.male || !mvpVotes.female) {
      setError('Selecciona ambos MVPs');
      return;
    }
    setSubmittingMVP(true);
    try {
      const allPlayers = [
        ...(homeTeam.players || []), 
        ...(awayTeam.players || [])
      ];
      
      const maleMVP = allPlayers.find(p => p.name === mvpVotes.male);
      const femaleMVP = allPlayers.find(p => p.name === mvpVotes.female);
      
      const { data: updateData, error: mvpError } = await supabase
        .from('matches')
        .update({ 
          mvp_male_name: mvpVotes.male,
          mvp_female_name: mvpVotes.female,
          mvp_male_photo_url: maleMVP?.photo_url || null,
          mvp_female_photo_url: femaleMVP?.photo_url || null,
          mvp_male_voted: true,
          mvp_female_voted: true,
          mvp_voted: true,
          home_score: setsData.homeWon,
          away_score: setsData.awayWon
        })
        .eq('id', matchId)
        .select()
        .single();
      
      if (mvpError) {
        console.error('Error guardando MVPs:', mvpError);
        throw mvpError;
      }

      if (updateData) {
        setMatch(updateData);
      }
      
      await exitFullscreenMode();
      setIsFullscreen(false);
      
      setShowMVPModal(false);
      navigate('/dashboard/partidos');
    } catch (err) {
      console.error('Error en submitMVPs:', err);
      setError('Error guardando MVPs: ' + err.message);
    } finally {
      setSubmittingMVP(false);
    }
  };

  // ============================================================================
  // 🔙 VOLVER AL DASHBOARD
  // ============================================================================
  const handleBack = function() {
    if (match && match.status === 'finished' && !match.mvp_voted) {
      alert('⚠️ Vota los MVPs antes de salir.');
      setShowMVPModal(true);
      return;
    }
    navigate('/dashboard/partidos');
  };

  // ============================================================================
  // 🖼️ ESTADOS DE CARGA Y ERROR
  // ============================================================================
  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Cargando marcador...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className={styles.errorBox}>
        <span>⚠️ </span>
        <span>{error}</span>
        <Button 
          variant="ghost" 
          onClick={handleBack} 
          style={{ marginTop: '1rem' }}
        >
          ← Volver
        </Button>
      </div>
    );
  }
  
  if (!match || !homeTeam || !awayTeam) {
    return (
      <div className={styles.empty}>Partido no encontrado</div>
    );
  }

  // ============================================================================
  // 👥 PREPARAR JUGADORES PARA MVP
  // ============================================================================
  const allPlayers = [
    ...(homeTeam.players || []).map(function(p) {
      return { ...p, team: homeTeam.team_name };
    }), 
    ...(awayTeam.players || []).map(function(p) {
      return { ...p, team: awayTeam.team_name };
    })
  ];
  
  const isMale = function(g) {
    if (!g) {
      return false;
    }
    const lower = g.toLowerCase();
    return ['male', 'm', 'hombre', 'masculino'].includes(lower);
  };
  
  const isFemale = function(g) {
    if (!g) {
      return false;
    }
    const lower = g.toLowerCase();
    return ['female', 'f', 'mujer', 'femenino'].includes(lower);
  };
  
  const maleCandidates = allPlayers.filter(function(p) {
    return isMale(p.gender);
  });
  
  const femaleCandidates = allPlayers.filter(function(p) {
    return isFemale(p.gender);
  });

  // ============================================================================
  // 🎨 RENDERIZADO DE LA INTERFAZ
  // ============================================================================
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button onClick={handleBack} className={styles.backBtn}>← Volver</button>
        <h1 className={styles.pageTitle}>Marcador Árbitro</h1>
        <div className={styles.headerRight}>
          <div className={styles.matchCode}>
            <span>Código: </span>
            <code>{match.referee_code || 'N/A'}</code>
          </div>
          <button 
            onClick={toggleFullscreen} 
            className={styles.fullscreenBtn} 
            title="Pantalla completa / Horizontal"
          >
            {isFullscreen ? '📱' : '📺'}
          </button>
        </div>
      </header>

      <Card className={styles.scoreboardCard}>
        {/* Sets globales */}
        <div className={styles.globalSets}>
          <span className={styles.teamSets}>
            {homeTeam.team_name}: <strong>{setsData.homeWon}</strong>
          </span>
          <span className={styles.vsSets}>VS</span>
          <span className={styles.teamSets}>
            {awayTeam.team_name}: <strong>{setsData.awayWon}</strong>
          </span>
        </div>

        {/* Layout lado a lado */}
        <div className={styles.scoreMain}>
          {/* Equipo Local */}
          <div className={styles.teamSide + ' ' + styles.teamLeft}>
            <div className={styles.badgeWrapper}>
              {homeTeam.badge_url ? (
                <img 
                  src={homeTeam.badge_url} 
                  alt={homeTeam.team_name} 
                  className={styles.teamBadge} 
                />
              ) : (
                <div className={styles.badgePlaceholder}>🏐</div>
              )}
            </div>
            <h2 className={styles.teamName}>{homeTeam.team_name}</h2>
            <span className={styles.teamLabel}>Local</span>
            <div className={styles.scoreControls}>
              <button 
                className={styles.scoreBtn} 
                onClick={function() {
                  return updatePoints('home', (match.live_points_home || 0) - 1);
                }} 
                disabled={updating}
              >
                −
              </button>
              <span className={styles.scoreDisplay}>{match.live_points_home || 0}</span>
              <button 
                className={styles.scoreBtn} 
                onClick={function() {
                  return updatePoints('home', (match.live_points_home || 0) + 1);
                }} 
                disabled={updating}
              >
                +
              </button>
            </div>
          </div>

          {/* Centro: Set actual + VS */}
          <div className={styles.centerInfo}>
            <div className={styles.currentSetBadge}>SET {setsData.current}</div>
            <div className={styles.vsBig}>VS</div>
          </div>

          {/* Equipo Visitante */}
          <div className={styles.teamSide + ' ' + styles.teamRight}>
            <div className={styles.badgeWrapper}>
              {awayTeam.badge_url ? (
                <img 
                  src={awayTeam.badge_url} 
                  alt={awayTeam.team_name} 
                  className={styles.teamBadge} 
                />
              ) : (
                <div className={styles.badgePlaceholder}>🏐</div>
              )}
            </div>
            <h2 className={styles.teamName}>{awayTeam.team_name}</h2>
            <span className={styles.teamLabel}>Visitante</span>
            <div className={styles.scoreControls}>
              <button 
                className={styles.scoreBtn} 
                onClick={function() {
                  return updatePoints('away', (match.live_points_away || 0) - 1);
                }} 
                disabled={updating}
              >
                −
              </button>
              <span className={styles.scoreDisplay}>{match.live_points_away || 0}</span>
              <button 
                className={styles.scoreBtn} 
                onClick={function() {
                  return updatePoints('away', (match.live_points_away || 0) + 1);
                }} 
                disabled={updating}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Botón Finalizar Set */}
        <div className={styles.finishSection}>
          <Button 
            variant="primary" 
            size="lg" 
            onClick={finishSet} 
            disabled={
              updating || 
              (match.live_points_home === match.live_points_away) || 
              match.status === 'finished'
            } 
            className={styles.finishBtn}
          >
            🏁 Finalizar Set
          </Button>
          {match.live_points_home === match.live_points_away && (
            <small className={styles.warningText}>
              ⚠️ Ajusta puntos para desempatar
            </small>
          )}
        </div>
      </Card>

      {/* Info del partido */}
      <Card className={styles.infoCard}>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>📅 Fecha</span>
            <span className={styles.infoValue}>{getFormattedDate()}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>⏰ Hora</span>
            <span className={styles.infoValue}>{getFormattedTime()}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>🏟️ Pista</span>
            <span className={styles.infoValue}>{getCourt()}</span>
          </div>
        </div>
      </Card>

      {/* Modal MVP */}
      {showMVPModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>🏆 Votar MVPs</h3>
            <p className={styles.modalSubtitle}>
              Selecciona al mejor jugador masculino y femenino
            </p>
            <div className={styles.mvpGrid}>
              <div className={styles.mvpColumn}>
                <div className={styles.mvpHeader}>👨 Masculino</div>
                <div className={styles.playersList}>
                  {maleCandidates.length > 0 ? (
                    maleCandidates.map(function(p, i) {
                      return (
                        <button 
                          key={i} 
                          className={
                            styles.playerCard + 
                            ' ' + 
                            (mvpVotes.male === p.name ? styles.selected : '')
                          } 
                          onClick={function() {
                            return setMvpVotes(function(v) {
                              return { ...v, male: p.name, malePhoto: p.photo_url || '' };
                            });
                          }}
                        >
                          <div className={styles.playerAvatar}>
                            {p.photo_url ? (
                              <img src={p.photo_url} alt={p.name} />
                            ) : (
                              <span>👤</span>
                            )}
                          </div>
                          <div className={styles.playerInfo}>
                            <span className={styles.playerName}>
                              {p.name} {p.surname}
                            </span>
                            <span className={styles.playerTeam}>{p.team}</span>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className={styles.emptyPlayers}>Sin jugadores</div>
                  )}
                </div>
              </div>
              <div className={styles.mvpColumn}>
                <div className={styles.mvpHeader}>👩 Femenino</div>
                <div className={styles.playersList}>
                  {femaleCandidates.length > 0 ? (
                    femaleCandidates.map(function(p, i) {
                      return (
                        <button 
                          key={i} 
                          className={
                            styles.playerCard + 
                            ' ' + 
                            (mvpVotes.female === p.name ? styles.selected : '')
                          } 
                          onClick={function() {
                            return setMvpVotes(function(v) {
                              return { ...v, female: p.name, femalePhoto: p.photo_url || '' };
                            });
                          }}
                        >
                          <div className={styles.playerAvatar}>
                            {p.photo_url ? (
                              <img src={p.photo_url} alt={p.name} />
                            ) : (
                              <span>👤</span>
                            )}
                          </div>
                          <div className={styles.playerInfo}>
                            <span className={styles.playerName}>
                              {p.name} {p.surname}
                            </span>
                            <span className={styles.playerTeam}>{p.team}</span>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className={styles.emptyPlayers}>Sin jugadoras</div>
                  )}
                </div>
              </div>
            </div>
            <div className={styles.modalActions}>
              {!(match.status === 'finished' && !match.mvp_voted) && (
                <Button 
                  variant="ghost" 
                  onClick={function() {
                    return setShowMVPModal(false);
                  }} 
                  disabled={submittingMVP}
                >
                  Cancelar
                </Button>
              )}
              <Button 
                variant="primary" 
                onClick={submitMVPs} 
                loading={submittingMVP} 
                disabled={!mvpVotes.male || !mvpVotes.female}
              >
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}