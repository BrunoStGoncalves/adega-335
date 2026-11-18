import { useEffect, useState, useCallback } from 'react'
import { supabase, clienteCadastro, emailDoUsuario, rpc } from '../supabase.js'
import { mensagemErro } from '../lib/formato.js'
import { useAuth } from '../auth.jsx'
import { useToast, Toast, Modal } from './comum.jsx'

export default function Usuarios() {
  const { perfil } = useAuth()
  const [lista, setLista] = useState([])
  const [novo, setNovo] = useState({ nome: '', usuario: '', senha: '', papel: 'operador' })
  const [senhaDe, setSenhaDe] = useState(null)
  const [novaSenha, setNovaSenha] = useState('')
  const [toast, mostrar] = useToast()

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('perfis').select('*').order('nome')
    if (error) mostrar(mensagemErro(error)); else setLista(data)
  }, [mostrar])
  useEffect(() => { carregar() }, [carregar])

  async function cadastrar(e) {
    e.preventDefault()
    const usuario = novo.usuario.trim().toLowerCase()
    if (!novo.nome.trim() || !/^[a-z0-9._-]{3,}$/.test(usuario)) return mostrar('Informe o nome e um usuário com 3+ letras/números, sem espaços.')
    if (novo.senha.length < 6) return mostrar('A senha precisa ter pelo menos 6 caracteres.')
    try {
      const { data, error } = await clienteCadastro.auth.signUp({
        email: emailDoUsuario(usuario), password: novo.senha, options: { data: { nome: novo.nome.trim(), usuario } },
      })
      if (error) throw error
      if (!data.user?.id) throw new Error('Não foi possível criar o usuário.')
      await rpc('configurar_usuario', { p_id: data.user.id, p_nome: novo.nome.trim(), p_papel: novo.papel, p_ativo: true })
      await clienteCadastro.auth.signOut()
      mostrar(`${novo.nome} cadastrado. Login: ${usuario}`)
      setNovo({ nome: '', usuario: '', senha: '', papel: 'operador' }); carregar()
    } catch (err) { mostrar(mensagemErro(err)) }
  }

  async function alterar(u, mudancas) {
    const n = { ...u, ...mudancas }
    try { await rpc('configurar_usuario', { p_id: u.id, p_nome: n.nome, p_papel: n.papel, p_ativo: n.ativo }); carregar() } catch (err) { mostrar(mensagemErro(err)) }
  }

  async function trocarSenha(e) {
    e.preventDefault()
    try { await rpc('redefinir_senha', { p_id: senhaDe.id, p_senha: novaSenha }); mostrar(`Senha de ${senhaDe.nome} redefinida`); setSenhaDe(null); setNovaSenha('') } catch (err) { mostrar(mensagemErro(err)) }
  }

  return (
    <>
      <div className="topo"><div><h1>Usuários</h1><p className="sub">Cada funcionário tem seu próprio login.</p></div></div>
      <form className="card" onSubmit={cadastrar}>
        <h2>Cadastrar funcionário</h2>
        <div className="form">
          <label>Nome<input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></label>
          <label>Usuário (login)<input value={novo.usuario} onChange={(e) => setNovo({ ...novo, usuario: e.target.value })} placeholder="ex.: juliana" /></label>
          <label>Senha inicial<input type="password" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} /></label>
          <label>Perfil<select value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value })}><option value="operador">Operador de caixa</option><option value="dono">Proprietário</option></select></label>
          <button className="btn grande verde largo">Cadastrar</button>
        </div>
      </form>
      <div className="card rolagem">
        <table className="tabela">
          <thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Status</th><th></th></tr></thead>
          <tbody>{lista.map((u) => {
            const eu = u.id === perfil.id
            return (
              <tr key={u.id}><td>{u.nome}{eu && <span className="mini"> (você)</span>}</td><td>{u.usuario}</td>
                <td><select value={u.papel} disabled={eu} onChange={(e) => alterar(u, { papel: e.target.value })}><option value="operador">Operador</option><option value="dono">Proprietário</option></select></td>
                <td><span className={u.ativo ? 'pilula ok' : 'pilula perigo'}>{u.ativo ? 'Ativo' : 'Desativado'}</span></td>
                <td className="acoes">
                  {!eu && <button className="btn claro pequeno" onClick={() => alterar(u, { ativo: !u.ativo })}>{u.ativo ? 'Desativar' : 'Ativar'}</button>}
                  <button className="btn claro pequeno" onClick={() => setSenhaDe(u)}>Redefinir senha</button>
                </td></tr>
            )
          })}</tbody>
        </table>
      </div>
      {senhaDe && (
        <Modal titulo={`Nova senha para ${senhaDe.nome}`} aoFechar={() => setSenhaDe(null)}>
          <form onSubmit={trocarSenha} className="form">
            <label className="largo">Nova senha (mín. 6 caracteres)<input autoFocus type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} /></label>
            <button className="btn grande largo">Salvar senha</button>
          </form>
        </Modal>
      )}
      <Toast texto={toast} />
    </>
  )
}
