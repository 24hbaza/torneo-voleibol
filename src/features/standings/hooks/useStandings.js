// src/features/standings/hooks/useStandings.js
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';

export function useStandings() {
  const [groups, setGroups] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Obtener todos los grupos
      const { data: groupsData, error: groupsError } = await supabase
        .from('groups')
        .select('id, name, draw_order')
        .order('draw_order', { ascending: true });

      if (groupsError) throw groupsError;

      // 2. Obtener todas las asignaciones con información de equipos
      // ✅ CORREGIDO: Eliminamos 'position' que no existe
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('group_assignments')
        .select(`
          team_id,
          group_id,
          profiles (
            team_name,
            badge_url
          )
        `);

      if (assignmentsError) throw assignmentsError;

      // 3. Obtener todos los partidos
      const { data: matchesData, error: matchesError } = await supabase
        .from('matches')
        .select('*');

      if (matchesError) throw matchesError;

      setGroups(groupsData || []);
      setAssignments(assignmentsData || []);
      setMatches(matchesData || []);

    } catch (err) {
      console.error('Error fetching standings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { 
    groups, 
    assignments, 
    matches, 
    loading, 
    error, 
    refetch: fetchData 
  };
}