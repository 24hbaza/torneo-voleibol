import { useNavigate } from 'react-router-dom';
import { useGuestMode } from '../hooks/useGuestMode';
import { Button } from '../design-system/components';
import styles from './GuestBanner.module.css';

export default function GuestBanner() {
  const { isGuest, disableGuest } = useGuestMode();
  const navigate = useNavigate();

  if (!isGuest) return null;

  // ✅ Ambos botones llevan al login
  const handleGoToLogin = () => {
    navigate('/login');
  };

  const handleExitGuestMode = () => {
    disableGuest(); // Limpia localStorage y estado interno
    navigate('/login'); // Redirige al login
  };

  return (
    <div className={styles.banner}>
      <div className={styles.left}>
        <span className={styles.icon}>👁️</span>
        <span className={styles.text}>Modo Espectador • Vista pública del torneo</span>
      </div>
      
      <div className={styles.right}>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleGoToLogin}
          className={styles.loginBtn}
        >
          Iniciar Sesión
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleExitGuestMode}
          className={styles.logoutBtn}
        >
          Salir
        </Button>
      </div>
    </div>
  );
}