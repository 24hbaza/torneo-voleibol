import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store';
import { Card, Button } from '../design-system/components';
import styles from './RefereeScoreboard.module.css';

const formatDate = (dateString) => {
  if (!dateString) return 'Por definir';
  try {
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? 'Por definir' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  } catch { return 'Por definir'; }
};

const formatTime = (dateString) => {
  if (!dateString) return '--:--';
  try {
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch { return '--:--'; }
};

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
  
  const [setsData, setSetsData] = useState({ homeWon: 0, awayWon: 0, details: [], current: 1 });
  const [showMVPModal, setShowMVPModal] = useState(false);
  const [mvpVotes, setMvpVotes] = useState({ male: '', female: '' });
  const [submittingMVP, setSubmittingMVP] = useState(false);

  useEffect(() => {
    const fetchMatchData = async () => {
      try {
        // ✅ SINTAXIS EXPLÍCITA Y CORRECTA: data: matchData
        // Supabase devuelve { data, error }. Aquí extraemos 'data' y lo renombramos a 'matchData'
        const { data: matchData, error: matchError } = await supabase
          .from('matches')
          .select(`
            *,
            home_team:profiles!home_team_id(team_name, badge_url, players),
            away_team:profiles!away_team_id(team_name, badge_url, players)
          `)
          .eq('id', matchId)
          .maybeSingle();

        if (matchError) throw matchError;
        if (!matchData) throw new Error('Partido no encontrado');

        setMatch(matchData);
        setHomeTeam(matchData.home_team);
        setAwayTeam(matchData.away_team);
        
        let details = [];
        try {
          if (matchData.sets_details) {
            const parsed = JSON.parse(matchData.sets_details);
            if (Array.isArray(parsed)) details = parsed;
          }
        } catch (e) {
          details = [];
        }
        
        const homeWon = details.filter(s => Array.isArray(s) && s[0] > s[1]).length;
        const awayWon = details.filter(s => Array.isArray(s) && s[1] > s[0]).length;

        setSetsData({ homeWon, awayWon, details, current: matchData.current_set || 1 });

        if (matchData.status === 'finished' && !matchData.mvp_voted) {
          setShowMVPModal(true);
        }
      } catch (err) {
        console.error('Error fetching match:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchMatchData();
  }, [matchId]);

  const updatePoints = async (team, newPoints) => {
    if (updating || newPoints < 0) return;
    setUpdating(true);
    try {
      const field = team === 'home' ? 'live_points_home' : 'live_points_away';
      const { error: updateError } = await supabase.from('matches').update({ [field]: newPoints }).eq('id', matchId);
      if (updateError) throw updateError;
      setMatch(prev => prev ? { ...prev, [field]: newPoints } : null);
    } catch (err) {
      setError('Error al actualizar puntos');
    } finally {
      setUpdating(false);
    }
  };

  const finishSet = async () => {
    if (updating) return;
    const homePts = match.live_points_home || 0;
    const awayPts = match.live_points_away || 0;

    if (homePts === awayPts) {
      setError('⚠️ No se puede finalizar un set con empate. Ajusta los puntos.');
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
        status: isMatchOver ? 'finished' : match.status
      };

      const { error: setUpdateError } = await supabase.from('matches').update(dbUpdate).eq('id', matchId);
      if (setUpdateError) throw setUpdateError;

      setSetsData(prev => ({ ...prev, details: newDetails, current: dbUpdate.current_set, homeWon: newHomeWon, awayWon: newAwayWon }));
      setMatch(prev => prev ? { ...prev, ...dbUpdate } : null);
      if (isMatchOver) setShowMVPModal(true);
    } catch (err) {
      setError('Error al registrar set');
    } finally {
      setUpdating(false);
    }
  };

  const submitMVPs = async () => {
    if (!mvpVotes.male || !mvpVotes.female) {
      setError('Selecciona un MVP Masculino y un MVP Femenino');
      return;
    }
    setSubmittingMVP(true);
    try {
      const { error: mvpError } = await supabase
        .from('matches')
        .update({ 
          mvp_male_name: mvpVotes.male, 
          mvp_female_name: mvpVotes.female, 
          mvp_voted: true 
        })
        .eq('id', matchId);
      
      if (mvpError) throw mvpError;
      setShowMVPModal(false);
      navigate('/dashboard/partidos');
    } catch (err) {
      console.error('Error guardando MVPs:', err);
      setError('Error al guardar MVPs: ' + err.message);
    } finally {
      setSubmittingMVP(false);
    }
  };

  const handleBack = () => {
    if (match?.status === 'finished' && !match?.mvp_voted) {
      alert('⚠️ Debes votar los MVPs antes de salir.');
      setShowMVPModal(true);
      return;
    }
    navigate('/dashboard/partidos');
  };

  const getSafeDate = () => {
    if (!match?.scheduled_at) return 'No especificada';
    const d = new Date(match.scheduled_at);
    return isNaN(d) ? 'Fecha inválida' : d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  
  const getSafeTime = () => {
    if (!match?.scheduled_at) return 'No especificada';
    const d = new Date(match.scheduled_at);
    return isNaN(d) ? '--:--' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <div className={styles.loading}><div className={styles.spinner}></div><p>Cargando marcador...</p></div>;
  if (error) return <div className={styles.errorBox}>⚠️ {error}<Button variant="ghost" onClick={() => navigate('/dashboard/partidos')} style={{ marginTop: '1rem' }}>← Volver</Button></div>;
  if (!match || !homeTeam || !awayTeam) return <div className={styles.empty}>Partido no encontrado</div>;

  const allPlayers = [
    ...(homeTeam.players || []).map(p => ({ ...p, team: homeTeam.team_name })),
    ...(awayTeam.players || []).map(p => ({ ...p, team: awayTeam.team_name }))
  ];

  const isMale = (g) => ['male', 'm', 'hombre', 'masculino'].includes(g?.toLowerCase());
  const isFemale = (g) => ['female', 'f', 'mujer', 'femenino'].includes(g?.toLowerCase());

  const maleCandidates = allPlayers.filter(p => isMale(p.gender));
  const femaleCandidates = allPlayers.filter(p => isFemale(p.gender));

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button onClick={handleBack} className={styles.backBtn}>← Volver</button>
        <h1 className={styles.pageTitle}>Marcador Árbitro</h1>
        <div className={styles.matchCode}><span>Código:</span><code>{match.referee_code || 'N/A'}</code></div>
      </header>

      <Card className={styles.scoreboardCard}>
        <div className={styles.globalSets}>
          <span className={styles.teamSets}>{homeTeam.team_name}: <strong>{setsData.homeWon}</strong></span>
          <span className={styles.vsSets}>VS</span>
          <span className={styles.teamSets}>{awayTeam.team_name}: <strong>{setsData.awayWon}</strong></span>
          <span className={styles.setsTarget}>(Al mejor de {(match.sets_to_win || 3) * 2 - 1})</span>
        </div>

        <div className={styles.currentSetInfo}>🏐 Set {setsData.current}</div>

        <div className={styles.teamScoreRow}>
          <div className={styles.teamInfo}>
            <div className={styles.badgeContainer}>
              {homeTeam.badge_url ? <img src={homeTeam.badge_url} alt={homeTeam.team_name} className={styles.teamBadge} /> : <div className={styles.badgePlaceholder}>🏐</div>}
            </div>
            <div className={styles.teamDetails}>
              <h2 className={styles.teamName}>{homeTeam.team_name}</h2>
              <span className={styles.teamLabel}>Local</span>
            </div>
          </div>
          <div className={styles.scoreControl}>
            <button className={styles.scoreBtnMinus} onClick={() => updatePoints('home', (match.live_points_home || 0) - 1)} disabled={updating}>−</button>
            <span className={styles.scoreValueLarge}>{match.live_points_home || 0}</span>
            <button className={styles.scoreBtnPlus} onClick={() => updatePoints('home', (match.live_points_home || 0) + 1)} disabled={updating}>+</button>
          </div>
        </div>

        <div className={styles.divider}><span className={styles.vsBadge}>VS</span></div>

        <div className={styles.teamScoreRow}>
          <div className={styles.teamInfo}>
            <div className={styles.badgeContainer}>
              {awayTeam.badge_url ? <img src={awayTeam.badge_url} alt={awayTeam.team_name} className={styles.teamBadge} /> : <div className={styles.badgePlaceholder}>🏐</div>}
            </div>
            <div className={styles.teamDetails}>
              <h2 className={styles.teamName}>{awayTeam.team_name}</h2>
              <span className={styles.teamLabel}>Visitante</span>
            </div>
          </div>
          <div className={styles.scoreControl}>
            <button className={styles.scoreBtnMinus} onClick={() => updatePoints('away', (match.live_points_away || 0) - 1)} disabled={updating}>−</button>
            <span className={styles.scoreValueLarge}>{match.live_points_away || 0}</span>
            <button className={styles.scoreBtnPlus} onClick={() => updatePoints('away', (match.live_points_away || 0) + 1)} disabled={updating}>+</button>
          </div>
        </div>

        <div className={styles.finishSetContainer}>
          <Button variant="primary" size="lg" onClick={finishSet} disabled={updating || (match.live_points_home === match.live_points_away) || match.status === 'finished'} className={styles.finishSetBtn}>
            🏁 Finalizar Set
          </Button>
          {match.live_points_home === match.live_points_away && <small className={styles.warningText}>⚠️ Ajusta los puntos para desempatar</small>}
        </div>
      </Card>

      <div className={styles.matchInfo}>
        <div className={styles.infoItem}><span className={styles.infoLabel}>📅 Fecha</span><span className={styles.infoValue}>{getSafeDate()}</span></div>
        <div className={styles.infoItem}><span className={styles.infoLabel}>⏰ Hora</span><span className={styles.infoValue}>{getSafeTime()}</span></div>
        <div className={styles.infoItem}><span className={styles.infoLabel}>🏟️ Pista</span><span className={styles.infoValue}>{match.court || 'Por definir'}</span></div>
      </div>

      {showMVPModal && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalCard} ${styles.modalMvpWide}`}>
            <h3 className={styles.modalTitle}>🏆 Votar MVPs del Partido</h3>
            <p className={styles.modalSubtitle}>Selecciona al mejor jugador masculino y femenino</p>
            
            <div className={styles.mvpGenderSplit}>
              <div className={styles.mvpGenderSection}>
                <div className={styles.mvpSectionTitle}>👨 MVP Masculino</div>
                <div className={styles.playersGrid}>
                  {maleCandidates.length > 0 ? maleCandidates.map((p, i) => (
                    <button key={i} className={`${styles.playerCard} ${mvpVotes.male === p.name ? styles.selected : ''}`} onClick={() => setMvpVotes(v => ({ ...v, male: p.name }))}>
                      <div className={styles.playerAvatar}>{p.photo_url ? <img src={p.photo_url} alt={p.name} /> : <span>👤</span>}</div>
                      <div className={styles.playerInfo}>
                        <span className={styles.playerName}>{p.name} {p.surname}</span>
                        <span className={styles.playerTeam}>{p.team}</span>
                      </div>
                    </button>
                  )) : <div className={styles.emptyPlayers}>No hay jugadores masculinos</div>}
                </div>
              </div>

              <div className={styles.mvpGenderSection}>
                <div className={styles.mvpSectionTitle}>👩 MVP Femenino</div>
                <div className={styles.playersGrid}>
                  {femaleCandidates.length > 0 ? femaleCandidates.map((p, i) => (
                    <button key={i} className={`${styles.playerCard} ${mvpVotes.female === p.name ? styles.selected : ''}`} onClick={() => setMvpVotes(v => ({ ...v, female: p.name }))}>
                      <div className={styles.playerAvatar}>{p.photo_url ? <img src={p.photo_url} alt={p.name} /> : <span>👤</span>}</div>
                      <div className={styles.playerInfo}>
                        <span className={styles.playerName}>{p.name} {p.surname}</span>
                        <span className={styles.playerTeam}>{p.team}</span>
                      </div>
                    </button>
                  )) : <div className={styles.emptyPlayers}>No hay jugadoras femeninas</div>}
                </div>
              </div>
            </div>

            <div className={styles.modalActions}>
              {!(match.status === 'finished' && !match.mvp_voted) && (
                <Button variant="ghost" onClick={() => setShowMVPModal(false)} disabled={submittingMVP}>Cancelar</Button>
              )}
              <Button variant="primary" onClick={submitMVPs} loading={submittingMVP} disabled={!mvpVotes.male || !mvpVotes.female}>
                {match.status === 'finished' && !match.mvp_voted ? 'Guardar y Salir' : 'Guardar MVPs'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}