import styles from "./Layout.module.css";

export default function Layout({ children }) {
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logoIcon}>🏐</span>
          <h1 className={styles.logoText}>VoleyTournament</h1>
        </div>
        <div className={styles.meta}>
          <span className={styles.seasonBadge}>Edición 2026</span>
        </div>
      </header>
      <main className={styles.container}>{children}</main>
      <footer className={styles.footer}>
        <p>© 2026 VoleyTournament | Gestión Deportiva Profesional</p>
      </footer>
    </div>
  );
}