import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore, useUIStore } from '../store';
import { useGuestMode } from '../hooks/useGuestMode';
import GuestBanner from '../components/GuestBanner';
import styles from './DashboardLayout.module.css';

export default function DashboardLayout() {
  const { user, profile, clearAuth } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { isGuest } = useGuestMode();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Lógica segura: Si hay usuario logueado, no es vista invitado
  const isGuestView = isGuest && !user;

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
    clearAuth();
    navigate('/login');
  };

  // Menú base
  const baseMenuItems = [
    { path: '/dashboard', label: 'Inicio', icon: '🏠' },
    { path: '/dashboard/partidos', label: 'Partidos', icon: '📅' },
    { path: '/dashboard/clasificacion', label: 'Clasificación', icon: '🏆' },
  ];

  // ✅ Añadimos Árbitro si aplica (equipos aceptados O admins)
  const menuItems = !isGuestView && (profile?.status === 'accepted' || profile?.is_admin)
    ? [...baseMenuItems, { path: '/arbitro', label: 'Árbitro', icon: '🟥' }]
    : baseMenuItems;

  // Añadimos Admin si aplica
  const finalMenuItems = !isGuestView && profile?.is_admin
    ? [...menuItems, { path: '/admin', label: 'Admin', icon: '🛡️' }]
    : menuItems;

  return (
    <div className={styles.layout}>
      <GuestBanner />
      
      {/* SIDEBAR ESCRITORIO (Oculto en móvil) */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.open : styles.closed}`}>
        <div className={styles.brand}>
          <span className={styles.logo}>🏐</span>
          <h1>24h Baza</h1>
        </div>
        <nav className={styles.nav}>
          {finalMenuItems.map(item => {
            const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
            return (
              <Link key={item.path} to={item.path} className={`${styles.navLink} ${isActive ? styles.active : ''}`} onClick={() => setMobileMenuOpen(false)}>
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        
        {!isGuestView && user && (
          <div className={styles.sidebarFooter}>
            <button onClick={handleLogout} className={styles.logoutBtnDesktop}>Cerrar Sesión</button>
          </div>
        )}
      </aside>

      <div className={styles.mainWrapper}>
        {/* TOPBAR MÓVIL */}
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button onClick={() => window.innerWidth < 768 ? setMobileMenuOpen(!mobileMenuOpen) : toggleSidebar()} className={styles.menuToggle}>☰</button>
            <span className={styles.topbarTitle}>24h Voleibol</span>
          </div>
          
          <div className={styles.userMenu}>
            <span className={styles.userName}>
              {isGuestView ? 'Espectador' : (profile?.team_name || user?.email?.split('@')[0] || 'Usuario')}
            </span>
            {!isGuestView && user && <div className={styles.avatar}>👤</div>}
          </div>
        </header>

        {/* OVERLAY MENÚ MÓVIL (Desplegable desde arriba) */}
        {mobileMenuOpen && (
          <div className={styles.mobileOverlay} onClick={() => setMobileMenuOpen(false)}>
            <nav className={styles.mobileNav} onClick={(e) => e.stopPropagation()}>
              <div className={styles.mobileHeader}>Menú</div>
              {finalMenuItems.map(item => (
                <Link key={item.path} to={item.path} className={`${styles.navLink} ${location.pathname === item.path ? styles.active : ''}`} onClick={() => setMobileMenuOpen(false)}>
                  <span className={styles.navIcon}>{item.icon}</span> {item.label}
                </Link>
              ))}
              {!isGuestView && user && (
                <button onClick={handleLogout} className={`${styles.navLink} ${styles.logout}`}>🚪 Cerrar Sesión</button>
              )}
            </nav>
          </div>
        )}

        {/* CONTENIDO PRINCIPAL */}
        <main className={styles.content}>
          <div className={styles.contentInner}>
            <Outlet />
          </div>
        </main>

        {/* BOTTOM NAV BAR (Solo visible en móvil - estilo APP) */}
        <nav className={styles.bottomNav}>
          {finalMenuItems.slice(0, 3).map(item => { // Mostramos solo los 3 principales en la barra inferior
            const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
            return (
              <Link key={item.path} to={item.path} className={`${styles.bottomItem} ${isActive ? styles.active : ''}`}>
                <span className={styles.bottomIcon}>{item.icon}</span>
                <span className={styles.bottomLabel}>{item.label}</span>
              </Link>
            );
          })}
          {/* Botón extra si hay más opciones (como Admin o Árbitro) */}
          {finalMenuItems.length > 3 && (
             <Link to={finalMenuItems[3].path} className={`${styles.bottomItem} ${location.pathname.startsWith(finalMenuItems[3].path) ? styles.active : ''}`}>
               <span className={styles.bottomIcon}>{finalMenuItems[3].icon}</span>
               <span className={styles.bottomLabel}>Más</span>
             </Link>
          )}
        </nav>
      </div>
    </div>
  );
}