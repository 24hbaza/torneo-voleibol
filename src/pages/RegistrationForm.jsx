// src/pages/RegistrationForm.jsx
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import styles from "../styles/RegistrationForm.module.css";

export default function RegistrationForm({ onComplete }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm({
    defaultValues: {
      team_name: "",
      players: [{ name: "", surname: "", phone: "", dni: "" }], //  Añadido surname
      captain_index: 0,
      receipt: null,
      badge: null
    }
  });

  const { fields, append, remove } = useFieldArray({ control, name: "players" });
  const playerCount = watch("players").length;

  const uploadFile = async (file, folder) => {
    if (!file) return null;
    const fileExt = file.name.split(".").pop();
    const fileName = `${user.id}_${folder}_${Date.now()}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("team-files")
      .upload(filePath, file, { cacheControl: "3600", upsert: false });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("team-files").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const onSubmit = async (data) => {
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const receiptUrl = await uploadFile(data.receipt[0], "receipts");
      const badgeUrl = await uploadFile(data.badge[0], "badges");

      const { error: dbError } = await supabase
        .from("profiles")
        .update({
          team_name: data.team_name,
          player_count: playerCount,
          captain_id: data.captain_index,
          players: data.players, // Se guarda con la nueva estructura {name, surname, phone, dni}
          receipt_url: receiptUrl,
          badge_url: badgeUrl,
          status: "pending"
        })
        .eq("id", user.id);

      if (dbError) throw dbError;

      setSuccess(true);
      setTimeout(() => onComplete(), 1500);
    } catch (err) {
      console.error(err);
      setError("Error al guardar la inscripción: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)}>
      <h2 className={styles.title}>📝 Inscripción del Equipo</h2>
      {error && <p className={styles.error}>{error}</p>}
      {success && <p className={styles.success}>✅ ¡Inscripción enviada! Pendiente de revisión.</p>}

      <div className={styles.field}>
        <label>Nombre del Equipo *</label>
        <input {...register("team_name", { required: "Obligatorio" })} className={styles.input} />
        {errors.team_name && <span className={styles.errorText}>{errors.team_name.message}</span>}
      </div>

      <div className={styles.section}>
        <h3>👥 Jugadores (Mínimo 6)</h3>
        {fields.map((field, index) => (
          <div key={field.id} className={styles.playerRow}>
            <div className={styles.playerInputs}>
              <input placeholder="Nombre" {...register(`players.${index}.name`, { required: "Nombre requerido" })} className={styles.inputSmall} />
              <input placeholder="Apellidos" {...register(`players.${index}.surname`, { required: "Apellidos requeridos" })} className={styles.inputSmall} />
              <input placeholder="Teléfono" {...register(`players.${index}.phone`, { required: "Teléfono requerido" })} className={styles.inputSmall} />
              <input placeholder="DNI" {...register(`players.${index}.dni`, { required: "DNI requerido" })} className={styles.inputSmall} />
            </div>
            <div className={styles.playerActions}>
              <label className={styles.captainLabel}>
                <input type="radio" {...register("captain_index")} value={index} defaultChecked={index === 0} />
                Capitán
              </label>
              {playerCount > 1 && (
                <button type="button" onClick={() => remove(index)} className={styles.removeBtn}>✕</button>
              )}
            </div>
          </div>
        ))}
        <button type="button" onClick={() => append({ name: "", surname: "", phone: "", dni: "" })} className={styles.addBtn} disabled={playerCount >= 12}>
          + Añadir Jugador
        </button>
      </div>

      <div className={styles.fileSection}>
        <div className={styles.field}>
          <label>📄 Recibo de Transferencia (PDF/Imagen) *</label>
          <input type="file" {...register("receipt", { required: "Obligatorio" })} accept=".pdf,.jpg,.jpeg,.png" className={styles.fileInput} />
          {errors.receipt && <span className={styles.errorText}>{errors.receipt.message}</span>}
        </div>
        <div className={styles.field}>
          <label>️ Escudo del Equipo (Opcional)</label>
          <input type="file" {...register("badge")} accept=".jpg,.jpeg,.png,.svg" className={styles.fileInput} />
        </div>
      </div>

      <button type="submit" disabled={loading} className={styles.submitBtn}>
        {loading ? "Enviando..." : "Enviar Inscripción"}
      </button>
    </form>
  );
}