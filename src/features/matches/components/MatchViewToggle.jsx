// src/features/matches/components/MatchViewToggle.jsx
import styles from './MatchViewToggle.module.css';

export default function MatchViewToggle({ viewMode, onChange }) {
  return (
    <div className={styles.toggle} role="tablist" aria-label="Vista de partidos">
      <button
        role="tab"
        aria-selected={viewMode === 'list'}
        className={`${styles.btn} ${viewMode === 'list' ? styles.active : ''}`}
        onClick={() => onChange('list')}
      >
        📋 Lista
      </button>
      <button
        role="tab"
        aria-selected={viewMode === 'grid'}
        className={`${styles.btn} ${viewMode === 'grid' ? styles.active : ''}`}
        onClick={() => onChange('grid')}
      >
        🔲 Cuadrícula
      </button>
      <button
        role="tab"
        aria-selected={viewMode === 'calendar'}
        className={`${styles.btn} ${viewMode === 'calendar' ? styles.active : ''}`}
        onClick={() => onChange('calendar')}
      >
        📅 Calendario
      </button>
    </div>
  );
}