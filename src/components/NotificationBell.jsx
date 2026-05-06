// src/components/NotificationBell.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../store';
import styles from './NotificationBell.module.css';

export default function NotificationBell() {
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (!error && data) setNotifications(data);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    fetchNotifications();
    if (!profile?.id) return;

    const channel = supabase
      .channel(`notifications_${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, fetchNotifications)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, fetchNotifications)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchNotifications, profile?.id]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  };

  const markAllAsRead = async () => {
    if (!profile?.id) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id).eq('read', false);
  };

  const handleNotificationClick = (notif) => {
    markAsRead(notif.id);
    setIsOpen(false);
    if (notif.link) navigate(notif.link);
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const typeIcons = {
    team_approved: '✅', team_rejected: '❌', match_scheduled: '📅',
    mvp_voted: '🏆', admin_broadcast: '📢'
  };

  return (
    <div className={styles.bellWrapper} ref={dropdownRef}>
      <button className={styles.bellBtn} onClick={() => setIsOpen(!isOpen)} aria-label="Notificaciones">
        🔔
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <header className={styles.dropdownHeader}>
            <h3>Notificaciones</h3>
            {unreadCount > 0 && <button className={styles.markAllBtn} onClick={markAllAsRead}>Marcar todo leído</button>}
          </header>

          <div className={styles.dropdownList}>
            {loading ? (
              <p className={styles.empty}>Cargando...</p>
            ) : notifications.length === 0 ? (
              <p className={styles.empty}>No hay notificaciones</p>
            ) : (
              notifications.map(notif => (
                <button key={notif.id} className={`${styles.item} ${!notif.read ? styles.unread : ''}`} onClick={() => handleNotificationClick(notif)}>
                  <span className={styles.icon}>{typeIcons[notif.type] || '📢'}</span>
                  <div className={styles.content}>
                    <span className={styles.title}>{notif.title}</span>
                    <span className={styles.message}>{notif.message}</span>
                    <span className={styles.time}>{new Date(notif.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {!notif.read && <span className={styles.dot}></span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}