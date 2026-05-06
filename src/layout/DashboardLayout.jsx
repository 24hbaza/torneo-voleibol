// src/layout/DashboardLayout.jsx
import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore, useUIStore } from '../store';
import NotificationBell from '../components/NotificationBell'; // ← NUEVO
import styles from './DashboardLayout.module.css';

export default function DashboardLayout() {
  const { profile, clearAuth } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const baseMenuItems = [
    { path: '/dashboard', label: '🏠 Inicio' },
    { path: '/dashboard/partidos', label: '📅 Partidos' },
    { path: '/dashboard/clasificacion', label: '🏆 Clasificación' },
    { path: '/arbitro', label: '🟥 Árbitro' },
  ];

  const menuItems = profile?.is_admin
    ? [...baseMenuItems, { path: '/admin', label: '🛡️ Administración' }]
    : baseMenuItems;

  return (
    <div className={styles.layout}>
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.open : styles.closed}`}>
        <div className={styles.brand}>
          <span className={styles.logo}>🏐</span>
          <h1>VoleyTournament</h1>
        </div>
        <nav className={styles.nav}>
          {menuItems.map(item => {
            const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
            return (
              <Link key={item.path} to={item.path} className={`${styles.navLink} ${isActive ? styles.active : ''}`} onClick={() => setMobileMenuOpen(false)}>
                <span className={styles.label}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className={styles.mainWrapper}>
        <header className={styles.topbar}>
          <button onClick={() => window.innerWidth < 768 ? setMobileMenuOpen(!mobileMenuOpen) : toggleSidebar()} className={styles.menuToggle} aria-label="Toggle menu">☰</button>
          
          <div className={styles.userMenu}>
            <NotificationBell /> {/* ✅ INTEGRADO */}
            <span className={styles.userName}>{profile?.team_name || profile?.email || 'Usuario'}</span>
            <button onClick={handleLogout} className={styles.logoutBtn}>Salir</button>
          </div>
        </header>

        {mobileMenuOpen && (
          <div className={styles.mobileOverlay} onClick={() => setMobileMenuOpen(false)}>
            <nav className={styles.mobileNav} onClick={(e) => e.stopPropagation()}>
              {menuItems.map(item => (
                <Link key={item.path} to={item.path} className={`${styles.navLink} ${location.pathname === item.path ? styles.active : ''}`} onClick={() => setMobileMenuOpen(false)}>
                  {item.label}
                </Link>
              ))}
              <button onClick={handleLogout} className={`${styles.navLink} ${styles.logout}`}>🚪 Cerrar Sesión</button>
            </nav>
          </div>
        )}

        <main className={styles.content}>
          <div className={styles.contentInner}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}