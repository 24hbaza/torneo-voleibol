// src/pages/admin/TeamManagement.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Badge, Button, Modal } from '../../design-system/components';
import { sendToTeam } from '../../lib/notifications';
import styles from './TeamManagement.module.css';

export default function TeamManagement() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(function() {
    fetchTeams();
  }, []);

  const fetchTeams = async function() {
    setLoading(true);
    try {
      const { data: teamsData, error: fetchError } = await supabase
        .from('profiles')
        .select(`
          id,
          created_at,
          team_name,
          captain_name,
          status,
          receipt_url,
          players,
          player_count,
          captain_id,
          badge_url,
          is_admin,
          welcome_kit_delivered,
          full_name,
          is_admin_team
        `)
        .order('created_at', { ascending: false });
      
      if (fetchError) {
        throw fetchError;
      }
      setTeams(teamsData || []);
    } catch (err) {
      console.error('Error fetching teams:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateTeamStatus = async function(teamId, newStatus) {
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ status: newStatus })
        .eq('id', teamId);
      
      if (updateError) {
        throw updateError;
      }
      
      fetchTeams();
      if (selectedTeam && selectedTeam.id === teamId) {
        setSelectedTeam(function(prev) {
          if (!prev) {
            return null;
          }
          return { ...prev, status: newStatus };
        });
      }

      if (newStatus === 'accepted') {
        await sendToTeam(teamId, 'team_approved', '✅ Equipo Aceptado', 'Tu equipo ha sido aprobado. ¡Prepárate para el torneo!');
      } else if (newStatus === 'rejected') {
        await sendToTeam(teamId, 'team_rejected', '❌ Equipo Rechazado', 'Tu equipo no cumple los requisitos. Contacta con la organización.');
      }
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Error al actualizar el estado');
    }
  };

  const updateAdminTeam = async function(teamId, isAdmin) {
    try {
      if (isAdmin) {
        var currentAdmins = teams.filter(function(t) {
          return t.is_admin_team === true;
        });
        
        if (currentAdmins.length >= 2) {
          alert('Solo puede haber 2 equipos administradores');
          return false;
        }
      }

      const { error: adminError } = await supabase
        .from('profiles')
        .update({ is_admin_team: isAdmin })
        .eq('id', teamId);

      if (adminError) {
        throw adminError;
      }
      
      fetchTeams();
      return true;
    } catch (err) {
      console.error('Error updating admin team:', err);
      alert('Error al actualizar equipo administrador');
      return false;
    }
  };

  const openTeamDetails = async function(team) {
    if (!team.players || team.players.length === 0) {
      const { data: teamData, error: detailError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', team.id)
        .single();
      
      if (!detailError && teamData) {
        setSelectedTeam(teamData);
      }
    } else {
      setSelectedTeam(team);
    }
    setIsModalOpen(true);
  };

  const closeModal = function() {
    setIsModalOpen(false);
    setSelectedTeam(null);
  };

  const filteredTeams = teams.filter(function(team) {
    if (filterStatus === 'all') {
      return true;
    }
    return team.status === filterStatus;
  });

  const formatDate = function(dateString) {
    if (!dateString) {
      return '-';
    }
    return new Date(dateString).toLocaleDateString('es-ES', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>👥 Gestión de Equipos</h1>
        <div className={styles.filters}>
          <select 
            value={filterStatus} 
            onChange={function(e) {
              setFilterStatus(e.target.value);
            }} 
            className={styles.filterSelect}
          >
            <option value="all">Todos los estados</option>
            <option value="pending">Pendientes</option>
            <option value="accepted">Aceptados</option>
            <option value="rejected">Rechazados</option>
          </select>
          <Button variant="ghost" onClick={fetchTeams}>🔄 Actualizar</Button>
        </div>
      </header>
      
      {loading ? (
        <div className={styles.loading}>Cargando equipos...</div>
      ) : (
        <>
          {/* ✅ TABLA PARA DESKTOP */}
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th>Capitán</th>
                  <th>Jugadores</th>
                  <th>Registro</th>
                  <th>Estado</th>
                  <th>Admin</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeams.length === 0 ? (
                  <tr>
                    <td colSpan="7" className={styles.emptyRow}>
                      No hay equipos que coincidan con el filtro.
                    </td>
                  </tr>
                ) : (
                  filteredTeams.map(function(team) {
                    return (
                      <tr key={team.id} className={styles.row}>
                        <td>
                          <div className={styles.teamCell}>
                            {team.badge_url ? (
                              <img 
                                src={team.badge_url} 
                                alt="Escudo" 
                                className={styles.miniBadge} 
                              />
                            ) : (
                              <div className={styles.miniBadgePlaceholder}>🏐</div>
                            )}
                            <div>
                              <strong className={styles.teamName}>
                                {team.team_name || 'Sin nombre'}
                                {team.is_admin_team && (
                                  <Badge variant="warning" size="sm" className={styles.adminBadge}>
                                    ADMIN
                                  </Badge>
                                )}
                              </strong>
                            </div>
                          </div>
                        </td>
                        <td>
                          {team.players && team.players[team.captain_id || 0] ? (
                            <span className={styles.captainName}>
                              {team.players[team.captain_id]?.name} {team.players[team.captain_id]?.surname}
                            </span>
                          ) : (
                            <span className={styles.noData}>-</span>
                          )}
                        </td>
                        <td>
                          <Badge variant="default" size="sm">
                            {team.player_count || 0} jugadores
                          </Badge>
                        </td>
                        <td>
                          <span className={styles.dateText}>{formatDate(team.created_at)}</span>
                        </td>
                        <td>
                          <Badge 
                            variant={
                              team.status === 'accepted' ? 'success' : 
                              team.status === 'rejected' ? 'error' : 'pending'
                            } 
                            size="sm"
                          >
                            {team.status}
                          </Badge>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={team.is_admin_team || false}
                            onChange={async function(e) {
                              var isChecked = e.target.checked;
                              await updateAdminTeam(team.id, isChecked);
                            }}
                            className={styles.adminCheckbox}
                            title="Marcar como equipo administrador (máx. 2)"
                          />
                        </td>
                        <td className={styles.actions}>
                          <Button variant="ghost" size="sm" onClick={function() {
                            openTeamDetails(team);
                          }}>
                            👁️ Ver
                          </Button>
                          <Link 
                            to={'/admin/teams/edit/' + team.id} 
                            className={styles.editLink}
                          >
                            ✏️ Editar
                          </Link>
                          {team.status === 'pending' && (
                            <>
                              <Button 
                                variant="success" 
                                size="sm" 
                                onClick={function() {
                                  updateTeamStatus(team.id, 'accepted');
                                }}
                              >
                                ✅
                              </Button>
                              <Button 
                                variant="danger" 
                                size="sm" 
                                onClick={function() {
                                  updateTeamStatus(team.id, 'rejected');
                                }}
                              >
                                ❌
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ✅ TARJETAS PARA MÓVIL */}
          <div className={styles.mobileCards}>
            {filteredTeams.length === 0 ? (
              <div className={styles.emptyRow}>
                No hay equipos que coincidan con el filtro.
              </div>
            ) : (
              filteredTeams.map(function(team) {
                return (
                  <div key={team.id} className={styles.mobileCard}>
                    <div className={styles.mobileCardHeader}>
                      {team.badge_url ? (
                        <img 
                          src={team.badge_url} 
                          alt="Escudo" 
                          className={styles.mobileCardBadge} 
                        />
                      ) : (
                        <div className={styles.miniBadgePlaceholder}>🏐</div>
                      )}
                      <div className={styles.mobileCardTitle}>
                        <h3>
                          {team.team_name || 'Sin nombre'}
                          {team.is_admin_team && (
                            <Badge variant="warning" size="sm" className={styles.adminBadge}>
                              ADMIN
                            </Badge>
                          )}
                        </h3>
                        <p>
                          {team.players && team.players[team.captain_id || 0] ? (
                            <>Capitán: {team.players[team.captain_id]?.name} {team.players[team.captain_id]?.surname}</>
                          ) : (
                            <>Capitán: -</>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className={styles.mobileCardBody}>
                      <div className={styles.mobileCardRow}>
                        <span className={styles.mobileCardLabel}>Jugadores</span>
                        <span className={styles.mobileCardValue}>
                          <Badge variant="default" size="sm">
                            {team.player_count || 0}
                          </Badge>
                        </span>
                      </div>
                      <div className={styles.mobileCardRow}>
                        <span className={styles.mobileCardLabel}>Registro</span>
                        <span className={styles.mobileCardValue}>{formatDate(team.created_at)}</span>
                      </div>
                      <div className={styles.mobileCardRow}>
                        <span className={styles.mobileCardLabel}>Estado</span>
                        <span className={styles.mobileCardValue}>
                          <Badge 
                            variant={
                              team.status === 'accepted' ? 'success' : 
                              team.status === 'rejected' ? 'error' : 'pending'
                            } 
                            size="sm"
                          >
                            {team.status}
                          </Badge>
                        </span>
                      </div>
                      <div className={styles.mobileCardRow}>
                        <span className={styles.mobileCardLabel}>Equipo Admin</span>
                        <span className={styles.mobileCardValue}>
                          <input
                            type="checkbox"
                            checked={team.is_admin_team || false}
                            onChange={async function(e) {
                              var isChecked = e.target.checked;
                              await updateAdminTeam(team.id, isChecked);
                            }}
                            className={styles.adminCheckbox}
                            title="Marcar como equipo administrador (máx. 2)"
                          />
                        </span>
                      </div>
                    </div>

                    <div className={styles.mobileCardFooter}>
                      <Button variant="ghost" size="sm" onClick={function() {
                        openTeamDetails(team);
                      }}>
                        👁️ Ver
                      </Button>
                      <Link 
                        to={'/admin/teams/edit/' + team.id} 
                        className={styles.editLink}
                      >
                        ✏️ Editar
                      </Link>
                      {team.status === 'pending' && (
                        <>
                          <Button 
                            variant="success" 
                            size="sm" 
                            onClick={function() {
                              updateTeamStatus(team.id, 'accepted');
                            }}
                          >
                            ✅
                          </Button>
                          <Button 
                            variant="danger" 
                            size="sm" 
                            onClick={function() {
                              updateTeamStatus(team.id, 'rejected');
                            }}
                          >
                            ❌
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      <Modal 
        isOpen={isModalOpen} 
        onClose={closeModal} 
        title={selectedTeam?.team_name || 'Detalles del Equipo'} 
        size="lg"
      >
        {selectedTeam && (
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTeamInfo}>
                {selectedTeam.badge_url && (
                  <img 
                    src={selectedTeam.badge_url} 
                    alt="Escudo" 
                    className={styles.modalBadge} 
                  />
                )}
                <div>
                  <h3 className={styles.modalTeamName}>
                    {selectedTeam.team_name}
                    {selectedTeam.is_admin_team && (
                      <Badge variant="warning" size="sm" className={styles.adminBadge}>
                        ADMIN
                      </Badge>
                    )}
                  </h3>
                  <Badge 
                    variant={
                      selectedTeam.status === 'accepted' ? 'success' : 
                      selectedTeam.status === 'rejected' ? 'error' : 'pending'
                    }
                  >
                    {selectedTeam.status}
                  </Badge>
                </div>
              </div>
              <div className={styles.modalMeta}>
                <p>
                  <strong>Registro:</strong> {formatDate(selectedTeam.created_at)}
                </p>
              </div>
            </div>

            <section className={styles.modalSection}>
              <h4 className={styles.sectionTitle}>📂 Documentos</h4>
              <div className={styles.docsGrid}>
                {selectedTeam.receipt_url ? (
                  <a 
                    href={selectedTeam.receipt_url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className={styles.docLink}
                  >
                    📄 Ver Recibo
                  </a>
                ) : (
                  <span className={styles.noDoc}>⚠️ Sin recibo</span>
                )}
              </div>
            </section>

            <section className={styles.modalSection}>
              <h4 className={styles.sectionTitle}>
                👥 Plantilla ({selectedTeam.players?.length || 0} jugadores)
              </h4>
              {selectedTeam.players && selectedTeam.players.length > 0 ? (
                <div className={styles.playersTable}>
                  <div className={styles.tableHeader}>
                    <span>#</span>
                    <span>Nombre</span>
                    <span>Teléfono</span>
                    <span>DNI</span>
                    <span>Género</span>
                    <span>Rol</span>
                  </div>
                  {selectedTeam.players.map(function(player, index) {
                    var isCaptain = index === (selectedTeam.captain_id || 0);
                    return (
                      <div 
                        key={index} 
                        className={styles.tableRow + (isCaptain ? ' ' + styles.isCaptain : '')}
                      >
                        <span>{index + 1}</span>
                        <span>{player.name} {player.surname}</span>
                        <span>{player.phone || '-'}</span>
                        <span>{player.dni || '-'}</span>
                        <span>{player.gender === 'female' ? '👩' : '👨'}</span>
                        <span>
                          {isCaptain && (
                            <Badge variant="success" size="sm">Capitán</Badge>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.noData}>No hay jugadores registrados.</p>
              )}
            </section>

            <section className={styles.modalSection}>
              <h4 className={styles.sectionTitle}>⚙️ Acciones</h4>
              <div className={styles.adminActions}>
                {selectedTeam.status !== 'accepted' && (
                  <Button 
                    variant="success" 
                    onClick={function() {
                      updateTeamStatus(selectedTeam.id, 'accepted');
                      closeModal();
                    }}
                  >
                    ✅ Aprobar
                  </Button>
                )}
                {selectedTeam.status !== 'rejected' && (
                  <Button 
                    variant="danger" 
                    onClick={function() {
                      if (confirm('¿Rechazar equipo?')) {
                        updateTeamStatus(selectedTeam.id, 'rejected');
                        closeModal();
                      }
                    }}
                  >
                    ❌ Rechazar
                  </Button>
                )}
                <Button variant="ghost" onClick={closeModal}>Cerrar</Button>
              </div>
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
}