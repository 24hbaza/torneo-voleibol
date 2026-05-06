// src/components/DrawAnimation.jsx
import { useEffect, useState } from "react";
import styles from "../styles/DrawAnimation.module.css";

// Componente que simula la bola girando
const SpinningBall = ({ team, isRevealed }) => {
  return (
    <div className={styles.ballContainer}>
      <div className={`${styles.ball} ${!isRevealed ? styles.spinning : ""}`}>
        {!isRevealed ? (
          <span className={styles.ballIcon}></span>
        ) : (
          <div className={styles.revealContent}>
            {team.badge_url && <img src={team.badge_url} alt="Escudo" />}
            <span>{team.team_name}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default function DrawAnimation({ drawResults, onClose }) {
  const [step, setStep] = useState(0); // Índice actual del sorteo
  const [isRevealed, setIsRevealed] = useState(false); // Si ya se mostró el equipo

  useEffect(() => {
    if (step >= drawResults.length) {
      // Sorteo terminado
      setTimeout(onClose, 2000);
      return;
    }

    // 1. Mostrar bola girando
    setIsRevealed(false);

    // 2. Esperar 1.5s (Suspense)
    const timer1 = setTimeout(() => {
      setIsRevealed(true); // ¡Revelar equipo!
    }, 1500);

    // 3. Esperar 1.5s más para leer el equipo y pasar al siguiente
    const timer2 = setTimeout(() => {
      setStep(prev => prev + 1);
    }, 3000);

    return () => { clearTimeout(timer1); clearTimeout(timer2); };
  }, [step, drawResults, onClose]);

  if (!drawResults || drawResults.length === 0) return null;

  const currentResult = drawResults[step];
  const currentTeam = currentResult?.team;
  const currentGroup = currentResult?.group;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>🏆 Sorteo Oficial</h2>
        
        <div className={styles.stage}>
          {/* Escenario Principal */}
          {currentTeam ? (
            <div className={styles.animationBox}>
              <SpinningBall team={currentTeam} isRevealed={isRevealed} />
              
              <div className={styles.arrow}>⬇️</div>
              
              <div className={styles.groupSlot}>
                <span className={styles.groupName}>{currentGroup.name}</span>
              </div>
            </div>
          ) : (
            <div className={styles.finished}>
              <h3>¡Sorteo Finalizado!</h3>
              <p>Ya puedes ver los grupos en el panel principal.</p>
            </div>
          )}
        </div>

        {/* Barra de progreso */}
        <div className={styles.progressBar}>
          <div 
            className={styles.progressFill} 
            style={{ width: `${((step) / drawResults.length) * 100}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}