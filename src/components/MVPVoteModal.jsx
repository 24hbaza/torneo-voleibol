// src/components/MVPVoteModal.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../design-system/components';
import styles from './MVPVoteModal.module.css';

export default function MVPVoteModal({ matchId, homeTeamId, awayTeamId, onClose }) {
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMale, setSelectedMale] = useState(null);
  const [selectedFemale, setSelectedFemale] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchPlayers = async () => {
      const { data: home } = await supabase.from('profiles').select('team_name, players').eq('id', homeTeamId).single();
      const { data: away } = await supabase.from('profiles').select('team_name, players').eq('id', awayTeamId).single();
      
      if (home?.players) setHomePlayers(home.players.map((p, i) => ({ ...p, team: home.team_name, index: i, teamId: homeTeamId })));
      if (away?.players) setAwayPlayers(away.players.map((p, i) => ({ ...p, team: away.team_name, index: i, teamId: awayTeamId })));
      setLoading(false);
    };
    fetchPlayers();
  }, [homeTeamId, awayTeamId]);

  const handleVote = async () => {
    if (!selectedMale && !selectedFemale) return;
    setSubmitting(true);
    
    try {
      const updates = {};
      if (selectedMale) {
        updates.mvp_male_name = `${selectedMale.name} ${selectedMale.surname}`;
        updates.mvp_male_photo_url = selectedMale.photo_url || '';
        updates.mvp_male_voted = true;
      }
      if (selectedFemale) {
        updates.mvp_female_name = `${selectedFemale.name} ${selectedFemale.surname}`;
        updates.mvp_female_photo_url = selectedFemale.photo_url || '';
        updates.mvp_female_voted = true;
      }
      
      const { error } = await supabase.from('matches').update(updates).eq('id', matchId);
      if (!error) onClose();
    } catch (err) {
      console.error('Error voting MVP:', err);
      alert('Error al votar MVP');
    } finally {
      setSubmitting(false);
    }
  };

  const filterByGender = (players, gender) => players.filter(p => p.gender === gender);

  if (loading) return <div className={styles.modal}>Cargando jugadores...</div>;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2>🏆 Votar MVP del Partido</h2>
        <p className={styles.subtitle}>Selecciona al jugador/a más destacado:</p>
        
        {/* MVP Masculino */}
        <div className={styles.mvpSection}>
          <h3>👨 MVP Masculino</h3>
          <div className={styles.playersGrid}>
            {[...filterByGender(homePlayers, 'male'), ...filterByGender(awayPlayers, 'male')].map((p, idx) => (
              <button key={`m-${p.teamId}-${p.index}`} className={`${styles.playerBtn} ${selectedMale?.index === p.index && selectedMale?.teamId === p.teamId ? styles.selected : ''}`}
                onClick={() => setSelectedMale(p)}>
                <img src={p.photo_url || '/placeholder-user.png'} alt={p.name} className={styles.playerImg} />
                <span>{p.name} {p.surname}</span>
                <span className={styles.playerTeam}>{p.team}</span>
              </button>
            ))}
          </div>
          {filterByGender([...homePlayers, ...awayPlayers], 'male').length === 0 && <p className={styles.noPlayers}>No hay jugadores masculinos</p>}
        </div>

        {/* MVP Femenino */}
        <div className={styles.mvpSection}>
          <h3>👩 MVP Femenino</h3>
          <div className={styles.playersGrid}>
            {[...filterByGender(homePlayers, 'female'), ...filterByGender(awayPlayers, 'female')].map((p, idx) => (
              <button key={`f-${p.teamId}-${p.index}`} className={`${styles.playerBtn} ${selectedFemale?.index === p.index && selectedFemale?.teamId === p.teamId ? styles.selected : ''}`}
                onClick={() => setSelectedFemale(p)}>
                <img src={p.photo_url || '/placeholder-user.png'} alt={p.name} className={styles.playerImg} />
                <span>{p.name} {p.surname}</span>
                <span className={styles.playerTeam}>{p.team}</span>
              </button>
            ))}
          </div>
          {filterByGender([...homePlayers, ...awayPlayers], 'female').length === 0 && <p className={styles.noPlayers}>No hay jugadoras femeninas</p>}
        </div>

        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button variant="primary" onClick={handleVote} disabled={(!selectedMale && !selectedFemale) || submitting} loading={submitting}>
            Confirmar MVP{(selectedMale ? ' Masculino' : '')}{(selectedFemale ? ' y Femenino' : '')}
          </Button>
        </div>
      </div>
    </div>
  );
}