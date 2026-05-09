import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';

export function useStandings() {
  const [groups, setGroups] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Obtener Grupos
        const { data: groupsData, error: groupsError } = await supabase
          .from('groups')
          .select('*')
          .order('name');
        
        if (groupsError) throw groupsError;

        // 2. Obtener Asignaciones (Equipos en Grupos)
        // Hacemos JOIN con 'profiles' porque tu FK apunta ahí
        const { data: assignmentsData, error: assignError } = await supabase
          .from('group_assignments')
          .select(`
            id,
            group_id,
            team_id,
            created_at,
            draw_order,
            profiles (
              id,
              team_name,
              badge_url
            )
          `)
          .order('created_at');

        if (assignError) throw assignError;

        // 3. Obtener PARTIDOS FINALIZADOS
        // IMPORTANTE: Aquí faltaban sets_details, live_points_home y live_points_away
        const { data: matchesData, error: matchError } = await supabase
          .from('matches')
          .select(`
            id,
            group_id,
            home_team_id,
            away_team_id,
            home_score,
            away_score,
            status,
            phase,
            match_date,
            sets_details,
            live_points_home,
            live_points_away
          `)
          .eq('phase', 'group')
          .in('status', ['finished', 'completed'])
          .order('match_date', { ascending: false });

        if (matchError) throw matchError;

        // 4. Mapeo de datos para compatibilidad
        const mappedAssignments = (assignmentsData || []).map(a => ({
          ...a,
          profiles: a.profiles || { team_name: 'Equipo', badge_url: null }
        }));

        console.log('✅ Datos cargados:', {
          grupos: groupsData?.length,
          assignments: mappedAssignments.length,
          partidos: matchesData?.length
        });

        setGroups(groupsData || []);
        setAssignments(mappedAssignments);
        setMatches(matchesData || []);

      } catch (err) {
        console.error('❌ Error cargando clasificación:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { groups, assignments, matches, loading, error };
}