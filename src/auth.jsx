import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, emailDoUsuario } from './supabase.js'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(true)

  const carregarPerfil = useCallback(async (session) => {
    if (!session) { setPerfil(null); return }
    const { data } = await supabase.from('perfis').select('id,nome,usuario,papel,ativo').eq('id', session.user.id).single()
    if (!data || !data.ativo) {
      await supabase.auth.signOut()
      setPerfil(null)
      return 'inativo'
    }
    setPerfil(data)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      await carregarPerfil(data.session)
      setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evento, session) => {
      if (evento === 'SIGNED_OUT') setPerfil(null)
      if (evento === 'TOKEN_REFRESHED') carregarPerfil(session)
    })
    return () => sub.subscription.unsubscribe()
  }, [carregarPerfil])

  async function entrar(usuario, senha) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailDoUsuario(usuario), password: senha })
    if (error) throw error
    const r = await carregarPerfil(data.session)
    if (r === 'inativo') throw new Error('Este usuário está desativado. Fale com o proprietário.')
  }

  async function sair() {
    await supabase.auth.signOut()
    setPerfil(null)
  }

  return <Ctx.Provider value={{ perfil, carregando, entrar, sair, ehDono: perfil?.papel === 'dono' }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
