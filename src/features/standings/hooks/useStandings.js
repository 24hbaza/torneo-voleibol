// src/features/standings/hooks/useStandings.js
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';

export function useStandings() {
  const [state, setState] = useState({
    groups: [],
    assignments: [],
    matches: [],
    loading: true,
    error: null
  });

  const fetchData = useCallback(async () => {
    try {
      const [groupsRes, assignmentsRes, matchesRes] = await Promise.all([
        supabase.from('groups').select('id, name, draw_order').order('draw_order'),
        supabase.from('group_assignments').select(`
          group_id, team_id, draw_order,
          profiles!group_assignments_team_id_fkey(team_name, badge_url)
        `),
        supabase.from('matches').select('group_id, home_team_id, away_team_id, home_score, away_score')
          .eq('status', 'finished')
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;
      if (matchesRes.error) throw matchesRes.error;

      setState({
        groups: groupsRes.data || [],
        assignments: assignmentsRes.data || [],
        matches: matchesRes.data || [],
        loading: false,
        error: null
      });
    } catch (err) {
      console.error('Error loading standings:', err);
      setState(prev => ({ ...prev, loading: false, error: err.message }));
    }
  }, []);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('standings_live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        fetchData
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchData]);

  return { ...state, refresh: fetchData };
}