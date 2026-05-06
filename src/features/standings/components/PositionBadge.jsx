// src/features/standings/components/PositionBadge.jsx
import styles from './PositionBadge.module.css';

export default function PositionBadge({ position, isQualifying }) {
  // ✅ Clases explícitas para evitar errores de generación dinámica en CSS Modules
  const posClass = 
    position === 1 ? styles.pos1 : 
    position === 2 ? styles.pos2 : 
    position === 3 ? styles.pos3 : styles.posDefault;

  return (
    <span className={`${styles.badge} ${posClass} ${isQualifying ? styles.qualifying : ''}`}>
      {position}º
    </span>
  );
}