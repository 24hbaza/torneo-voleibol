// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css' // ← ¡IMPORTANTE! Esta línea debe existir
import { AuthProvider } from './context/AuthContext' // ← Si aún usas el contexto antiguo, quítalo. Zustand ya lo maneja.

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)