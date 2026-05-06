// src/components/TeamDetailsModal.jsx
import styles from "../styles/TeamDetailsModal.module.css";

export default function TeamDetailsModal({ team, onClose }) {
  if (!team) return null;

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // Determinar quién es el capitán basándonos en el índice guardado
  const captainIndex = team.captain_id || 0;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
        
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            {team.badge_url && (
              <img src={team.badge_url} alt="Escudo" className={styles.badge} />
            )}
            <div>
              <h2>{team.team_name || "Sin nombre"}</h2>
              <span className={`${styles.badgeStatus} ${styles[team.status]}`}>
                {team.status === "accepted" ? "✅ Aceptado" : team.status === "rejected" ? "❌ Denegado" : "⏳ Pendiente"}
              </span>
            </div>
          </div>
          <div className={styles.dateBox}>
            <small>Solicitud enviada:</small>
            <strong>{formatDate(team.created_at)}</strong>
          </div>
        </header>

        <div className={styles.content}>
          {/* Sección de Documentos */}
          <section className={styles.section}>
            <h3>📂 Documentos</h3>
            <div className={styles.docsGrid}>
              <a 
                href={team.receipt_url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className={styles.docLink}
                style={!team.receipt_url ? { opacity: 0.5, pointerEvents: "none" } : {}}
              >
                 Ver Recibo de Inscripción
              </a>
            </div>
          </section>

          {/* Sección de Jugadores */}
          <section className={styles.section}>
            <h3>👥 Listado de Jugadores ({team.player_count || 0})</h3>
            <div className={styles.playersTable}>
              <div className={styles.tableHeader}>
                <span>#</span>
                <span>Nombre Completo</span>
                <span>Teléfono</span>
                <span>DNI</span>
                <span>Rol</span>
              </div>
              {team.players && team.players.map((player, index) => (
                <div key={index} className={`${styles.tableRow} ${index === captainIndex ? styles.isCaptain : ""}`}>
                  <span>{index + 1}</span>
                  <span>{player.name} {player.surname}</span>
                  <span>{player.phone}</span>
                  <span>{player.dni}</span>
                  <span>
                    {index === captainIndex && <span className={styles.captainTag}>Capitán</span>}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className={styles.footer}>
          <button onClick={onClose} className={styles.closeActionBtn}>Cerrar</button>
        </footer>
      </div>
    </div>
  );
}