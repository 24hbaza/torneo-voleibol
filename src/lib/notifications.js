// src/lib/notifications.js
import { supabase } from './supabaseClient';

export const sendNotification = async ({ userId, type, title, message, link = null }) => {
  if (!userId) return false;
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    message,
    link
  });
  if (error) {
    console.error('Notification error:', error);
    return false;
  }
  return true;
};

export const sendToTeam = async (teamId, type, title, message) => {
  const { data, error } = await supabase.from('profiles').select('id').eq('id', teamId).single();
  if (error || !data?.id) return false;
  return sendNotification({ userId: data.id, type, title, message });
};