import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './auth.jsx'
import { configurado } from './supabase.js'
import './styles.css'

function SemConfiguracao() {
  return (
    <div className="centro">
      <div className="card" style={{ maxWidth: 520 }}>
        <h1>Configuração pendente</h1>
        <p>Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja o README).</p>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {configurado ? (
      <HashRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </HashRouter>
    ) : (
      <SemConfiguracao />
    )}
  </React.StrictMode>
)
