// src/features/matches/hooks/useMatches.js
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuthStore } from '../../../store';

export function useMatches({ userTeamId, filters = {} }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { profile } = useAuthStore();

  const fetchMatches = useCallback(async () => {
    if (!profile?.id && !userTeamId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const teamId = userTeamId || profile.id;
      let query = supabase
        .from('matches')
        .select(`
          id, match_date, status, home_score, away_score,
          live_points_home, live_points_away, current_set, court_number,
          verification_code,
          home:profiles!matches_home_team_id_fkey(id, team_name, badge_url),
          away:profiles!matches_away_team_id_fkey(id, team_name, badge_url),
          referee:profiles!matches_referee_team_id_fkey(team_name)
        `)
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);

      // Aplicar filtros
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.dateFrom) query = query.gte('match_date', filters.dateFrom);
      if (filters.dateTo) query = query.lte('match_date', filters.dateTo);
      
      const {  data, error: fetchError } = await query.order('match_date', { ascending: true });
      
      if (fetchError) throw fetchError;
      setMatches(data || []);
    } catch (err) {
      console.error('Error fetching matches:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [profile?.id, userTeamId, filters]);

  useEffect(() => {
    fetchMatches();

    // Suscripción Realtime para actualizaciones en vivo
    const channel = supabase
      .channel(`matches_${userTeamId || profile?.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        () => {
          console.log('📡 Match change detected, refreshing...');
          fetchMatches();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchMatches]);

  return { matches, loading, error, refresh: fetchMatches };
}