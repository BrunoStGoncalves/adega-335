import { useState } from 'react'
import { useAuth } from '../auth.jsx'
import { mensagemErro } from '../lib/formato.js'

export default function Login() {
  const { entrar } = useAuth()
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    if (!usuario.trim() || !senha) return setErro('Preencha usuário e senha.')
    setEnviando(true); setErro('')
    try { await entrar(usuario, senha) } catch (err) { setErro(mensagemErro(err)) } finally { setEnviando(false) }
  }

  return (
    <div className="centro fundo-login">
      <form className="card login" onSubmit={enviar} noValidate>
        <div className="logo">335</div>
        <div>
          <h1>Adega 335</h1>
          <p className="sub">Entre com seu usuário para continuar.</p>
        </div>
        {erro && <div className="alerta" role="alert">{erro}</div>}
        <label>Usuário ou e-mail
          <input autoFocus autoComplete="username" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        </label>
        <label className="campo-senha">Senha
          <input type={ver ? 'text' : 'password'} autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
          <button type="button" className="olho" onClick={() => setVer(!ver)}>{ver ? 'Ocultar' : 'Mostrar'}</button>
        </label>
        <button className="btn grande escuro" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}
