import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY
export const DOMINIO = import.meta.env.VITE_EMAIL_DOMINIO || 'adega335.local'
export const configurado = Boolean(url && chave)

export const supabase = configurado ? createClient(url, chave) : null

// Cliente separado para o dono cadastrar funcionários sem perder a própria sessão
export const clienteCadastro = configurado
  ? createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'adega-cadastro' } })
  : null

// Aceita o usuário ("juliana" vira juliana@dominio) ou o e-mail completo, se tiver "@"
export function emailDoUsuario(usuario) {
  const u = String(usuario).trim().toLowerCase()
  return u.includes('@') ? u : `${u}@${DOMINIO}`
}

// Chama uma função do banco e lança erro legível
export async function rpc(nome, args) {
  const { data, error } = await supabase.rpc(nome, args)
  if (error) throw error
  return data
}
