// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleSession = (session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    };

    // ✅ getSession(): { data: { session }, error }
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) console.error("getSession error:", error);
        handleSession(data?.session);
      })
      .catch((err) => {
        console.error("getSession exception:", err);
        setLoading(false);
      });

    // ✅ onAuthStateChange(): { data: { subscription } }
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        handleSession(session);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { data, error };
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return error;
  };

  const value = { user, loading, signUp, signIn, signOut };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}