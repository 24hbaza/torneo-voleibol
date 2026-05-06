// src/pages/RefereeScoreboard.jsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import MVPVoteModal from '../components/MVPVoteModal';
import styles from './RefereeScoreboard.module.css';

export default function RefereeScoreboard() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showMvpModal, setShowMvpModal] = useState(false);

  const fetchMatch = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select(`
        id, status, current_set, sets_to_win, points_to_win, phase, round, next_match_id,
        home_score, away_score, live_points_home, live_points_away,
        mvp_male_voted, mvp_female_voted, mvp_male_name, mvp_female_name,
        mvp_male_photo_url, mvp_female_photo_url,
        home:profiles!matches_home_team_id_fkey(id, team_name, badge_url),
        away:profiles!matches_away_team_id_fkey(id, team_name, badge_url)
      `)
      .eq('id', matchId)
      .single();
    
    if (data) {
      setMatch(data);
      if (data.status === 'scheduled' && data.phase !== 'playoff') {
        await supabase.from('matches').update({ status: 'live' }).eq('id', matchId);
      }
    }
    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    fetchMatch();
    const channel = supabase
      .channel(`match_${matchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, () => fetchMatch())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchMatch]);

  const updatePoints = async (team, delta) => {
    if (!match || match.status === 'finished') return;
    setActionLoading(true);
    const field = team === 'home' ? 'live_points_home' : 'live_points_away';
    const currentVal = match[field] || 0;
    const newVal = Math.max(0, currentVal + delta);
    setMatch(prev => ({ ...prev, [field]: newVal }));
    await supabase.from('matches').update({ [field]: newVal }).eq('id', matchId);
    setActionLoading(false);
  };

  const endSet = async () => {
    if (!match) return;
    setActionLoading(true);
    const homePts = match.live_points_home || 0;
    const awayPts = match.live_points_away || 0;
    const currentSetNum = match.current_set || 1;
    
    let newHomeSets = match.home_score || 0;
    let newAwaySets = match.away_score || 0;
    if (homePts > awayPts) newHomeSets++;
    else if (awayPts > homePts) newAwaySets++;

    const newSetsDetails = [...(match.sets_details || []), { set: currentSetNum, home: homePts, away: awayPts }];
    const setsToWin = match.sets_to_win || 2;
    const isMatchOver = newHomeSets >= setsToWin || newAwaySets >= setsToWin;

    await supabase.from('matches').update({
      home_score: newHomeSets,
      away_score: newAwaySets,
      sets_details: newSetsDetails,
      live_points_home: 0,
      live_points_away: 0,
      current_set: currentSetNum + 1,
      status: isMatchOver ? 'finished' : 'live'
    }).eq('id', matchId);
    
    // 🔗 Auto-progresión para playoffs
    if (isMatchOver && match.phase === 'playoff' && match.next_match_id) {
      await advanceWinner({ ...match, home_score: newHomeSets, away_score: newAwaySets, status: 'finished' });
    }
    
    setActionLoading(false);
  };

  const finishMatch = async () => {
    if (confirm('¿Finalizar partido oficialmente?')) {
      await supabase.from('matches').update({ status: 'finished' }).eq('id', matchId);
      
      // 🔗 Auto-progresión para playoffs
      if (match.phase === 'playoff' && match.next_match_id) {
        await advanceWinner({ ...match, status: 'finished' });
      }
      
      alert('Partido finalizado. ¡No olvides votar al MVP!');
      fetchMatch();
    }
  };

  // 🔗 Función para avanzar ganador al siguiente partido del bracket
  const advanceWinner = async (finishedMatch) => {
    if (!finishedMatch.next_match_id) return;
    
    const winner = finishedMatch.home_score > finishedMatch.away_score 
      ? finishedMatch.home_team_id 
      : finishedMatch.away_team_id;
    
    // Actualizar el siguiente partido: poner al ganador y activar estado
    await supabase.from('matches').update({
      home_team_id: winner, // Simplificado: el ganador va como local (puedes mejorar la lógica)
      status: 'scheduled',
      match_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // +24h por defecto
    }).eq('id', finishedMatch.next_match_id);
  };

  if (loading || !match) return <div className={styles.loading}>Cargando marcador...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.setInfo}>
          {match.phase === 'playoff' && <span className={styles.playoffBadge}>🏆 {match.round === 1 ? 'FINAL' : match.round === 2 ? 'SEMIS' : 'CUARTOS'}</span>}
          <span>SET {match.current_set || 1} DE {match.sets_to_win * 2 - 1}</span>
        </div>
        <div className={styles.matchStatus}>
          {match.status === 'finished' ? 'FINALIZADO' : match.status === 'live' ? '🔴 EN VIVO' : '⏳ PROGRAMADO'}
        </div>
      </header>

      <div className={styles.scoreboard}>
        {/* Equipo Local */}
        <div className={`${styles.teamPanel} ${styles.home}`}>
          <div className={styles.teamInfo}>
            {match.home?.badge_url && <img src={match.home.badge_url} alt="" />}
            <h2>{match.home?.team_name || 'Local'}</h2>
          </div>
          <div className={styles.score}>{match.live_points_home ?? 0}</div>
          <div className={styles.setsWon}>{match.home_score || 0} SETS</div>
          <div className={styles.controls}>
            <button onClick={() => updatePoints('home', 1)} disabled={actionLoading || match.status === 'finished'}>+1 PTO</button>
            <button onClick={() => updatePoints('home', -1)} disabled={actionLoading || match.status === 'finished'}>-1</button>
          </div>
        </div>

        {/* Centro: Sets, MVP y Progresión */}
        <div className={styles.centerInfo}>
          <div className={styles.setsDisplay}>{match.home_score || 0} - {match.away_score || 0}</div>
          
          {match.status !== 'finished' && (
            <button className={styles.endSetBtn} onClick={endSet} disabled={actionLoading}>
              ⏹️ FINALIZAR SET
            </button>
          )}
          
          {match.status === 'finished' && (
            <div className={styles.mvpButtons}>
              {!match.mvp_male_voted && (
                <button className={styles.mvpBtnMale} onClick={() => setShowMvpModal(true)}>👨 Votar MVP M</button>
              )}
              {!match.mvp_female_voted && (
                <button className={styles.mvpBtnFemale} onClick={() => setShowMvpModal(true)}>👩 Votar MVP F</button>
              )}
              {match.mvp_male_voted && <div className={styles.mvpAssigned}>✅ MVP M: {match.mvp_male_name}</div>}
              {match.mvp_female_voted && <div className={styles.mvpAssigned}>✅ MVP F: {match.mvp_female_name}</div>}
              {match.next_match_id && <div className={styles.progressHint}>🔗 Ganador avanza a siguiente ronda</div>}
            </div>
          )}
        </div>

        {/* Equipo Visitante */}
        <div className={`${styles.teamPanel} ${styles.away}`}>
          <div className={styles.teamInfo}>
            <h2>{match.away?.team_name || 'Visitante'}</h2>
            {match.away?.badge_url && <img src={match.away.badge_url} alt="" />}
          </div>
          <div className={styles.score}>{match.live_points_away ?? 0}</div>
          <div className={styles.setsWon}>{match.away_score || 0} SETS</div>
          <div className={styles.controls}>
            <button onClick={() => updatePoints('away', 1)} disabled={actionLoading || match.status === 'finished'}>+1 PTO</button>
            <button onClick={() => updatePoints('away', -1)} disabled={actionLoading || match.status === 'finished'}>-1</button>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        {match.status !== 'finished' && (
          <button className={styles.finishMatchBtn} onClick={finishMatch}>🏁 FORZAR FIN</button>
        )}
        <button className={styles.backBtn} onClick={() => navigate('/arbitro')}>🚪 Salir</button>
      </footer>

      {showMvpModal && (
        <MVPVoteModal 
          matchId={matchId} 
          homeTeamId={match.home?.id} 
          awayTeamId={match.away?.id} 
          onClose={() => { setShowMvpModal(false); fetchMatch(); }} 
        />
      )}
    </div>
  );
}