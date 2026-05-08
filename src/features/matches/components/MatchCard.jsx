// src/features/matches/components/MatchCard.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './MatchCard.module.css';

export default function MatchCard({ match, userTeamId }) {
  const navigate = useNavigate();
  const [codeInput, setCodeInput] = useState('');

  const homeTeam = match.home;
  const awayTeam = match.away;
  const refereeTeam = match.referee;
  
  const isHome = homeTeam?.id === userTeamId;
  const isAway = awayTeam?.id === userTeamId;
  const isMyMatch = isHome || isAway;
  const isMyRefereeMatch = match.referee_team_id === userTeamId;

  const setsHome = match.home_score ?? 0;
  const setsAway = match.away_score ?? 0;
  const ptsHome = match.live_points_home ?? 0;
  const ptsAway = match.live_points_away ?? 0;
  const status = match.status;

  const isLive = status === 'live' || ptsHome > 0 || ptsAway > 0;
  const isFinished = status === 'finished';
  const statusClass = isLive ? styles.statusLive : isFinished ? styles.statusFinished : styles.statusScheduled;

  const dateObj = match.match_date ? new Date(match.match_date) : null;
  const dateStr = dateObj ? dateObj.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  const timeStr = dateObj ? dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';

  // ✅ FIX #7: Validación flexible sin límite de caracteres
  const handleRefereeAccess = (e) => {
    e.preventDefault();
    const inputCode = codeInput.trim().toUpperCase();
    const storedCode = match.verification_code?.toUpperCase();
    
    if (storedCode && inputCode === storedCode) {
      navigate(`/arbitro/partido/${match.id}`);
    } else {
      alert('❌ Código incorrecto. Verifica con la organización.');
    }
  };

  const roleBadge = isMyMatch ? '🏐 Jugando' : isMyRefereeMatch ? '🟥 Arbitrando' : null;

  return (
    <article className={`${styles.card} ${isLive ? styles.live : ''} ${isFinished ? styles.finished : ''} ${isMyMatch ? styles.myMatch : ''} ${isMyRefereeMatch ? styles.refereeMatch : ''}`}>
      <div className={styles.header}>
        <span className={styles.date}>{dateStr}</span>
        <span className={styles.time}>🕐 {timeStr}</span>
        {match.court_number && <span className={styles.court}>🏟️ Pista {match.court_number}</span>}
        {isLive && <span className={`${styles.liveBadge} ${styles.pulse}`}>🔴 EN VIVO</span>}
        {!isLive && !isFinished && <span className={`${styles.statusBadge} ${statusClass}`}>📅 Programado</span>}
        {isFinished && <span className={`${styles.statusBadge} ${statusClass}`}>✅ Finalizado</span>}
        {roleBadge && <span className={styles.roleBadge}>{roleBadge}</span>}
      </div>

      <div className={styles.content}>
        <div className={`${styles.team} ${isHome ? styles.active : ''}`}>
          <div className={styles.badgeWrapper}>{homeTeam?.badge_url ? <img src={homeTeam.badge_url} alt={homeTeam.team_name} className={styles.badge} /> : <div className={styles.badgePlaceholder}>🏐</div>}</div>
          <div className={styles.teamInfo}>
            <span className={styles.teamName}>{homeTeam?.team_name || 'Local'}</span>
            {isHome && <span className={styles.myTeamTag}>👤 Tu equipo</span>}
          </div>
        </div>

        <div className={styles.scoreCenter}>
          <div className={styles.scoreRow}><span className={styles.scoreLabel}>SETS</span><span className={styles.setsScore}>{setsHome} - {setsAway}</span></div>
          <div className={styles.scoreRow}>
            <span className={styles.scoreLabel}>PUNTOS</span>
            <span className={`${styles.pointsScore} ${isLive ? styles.livePulse : ''}`}>{(ptsHome > 0 || ptsAway > 0 || isLive || isFinished) ? `${ptsHome} - ${ptsAway}` : 'VS'}</span>
          </div>
          {match.current_set && isLive && <span className={styles.currentSetTag}>Set {match.current_set}</span>}
        </div>

        <div className={`${styles.team} ${isAway ? styles.active : ''}`}>
          <div className={styles.badgeWrapper}>{awayTeam?.badge_url ? <img src={awayTeam.badge_url} alt={awayTeam.team_name} className={styles.badge} /> : <div className={styles.badgePlaceholder}>🏐</div>}</div>
          <div className={styles.teamInfo}>
            <span className={styles.teamName}>{awayTeam?.team_name || 'Visitante'}</span>
            {isAway && <span className={styles.myTeamTag}>👤 Tu equipo</span>}
          </div>
        </div>
      </div>

      {/* ✅ FIX #7: Formulario sin maxLength, validación robusta */}
      {isMyRefereeMatch && !isFinished && (
        <form onSubmit={handleRefereeAccess} className={styles.refereeZone}>
          <span className={styles.refereeLabel}>🟥 Eres el árbitro. Introduce el código:</span>
          <div className={styles.codeInputRow}>
            <input 
              type="text" 
              placeholder="Código de acceso" 
              value={codeInput} 
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())} 
              className={styles.codeInput}
              autoComplete="off"
              spellCheck="false"
            />
            <button type="submit" className={styles.accessBtn}>Acceder</button>
          </div>
        </form>
      )}

      {/* MVPs del Partido */}
      {(match.mvp_male_voted || match.mvp_female_voted) && (
        <div className={styles.mvpSection}>
          {match.mvp_male_voted && (
            <div className={styles.mvpItem}>
              <img src={match.mvp_male_photo_url || '/placeholder-user.png'} alt="MVP M" className={styles.mvpImg} />
              <div className={styles.mvpInfo}>
                <span className={styles.mvpLabel}>👨 MVP Masculino</span>
                <span className={styles.mvpName}>{match.mvp_male_name}</span>
              </div>
            </div>
          )}
          {match.mvp_female_voted && (
            <div className={styles.mvpItem}>
              <img src={match.mvp_female_photo_url || '/placeholder-user.png'} alt="MVP F" className={styles.mvpImg} />
              <div className={styles.mvpInfo}>
                <span className={styles.mvpLabel}>👩 MVP Femenino</span>
                <span className={styles.mvpName}>{match.mvp_female_name}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={styles.footer}>
        {refereeTeam && <span className={styles.refereeInfo}>🟥 Árbitro: {refereeTeam.team_name}</span>}
      </div>
    </article>
  );
}