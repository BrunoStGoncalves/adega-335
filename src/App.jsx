import { Routes, Route, Navigate, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import Login from './pages/Login.jsx'
import PDV from './pages/PDV.jsx'
import MinhasVendas from './pages/MinhasVendas.jsx'
import Painel from './pages/Painel.jsx'
import Produtos from './pages/Produtos.jsx'
import Estoque from './pages/Estoque.jsx'
import Caixas from './pages/Caixas.jsx'
import Usuarios from './pages/Usuarios.jsx'

const MENU = {
  dono: [['/painel', 'Painel'], ['/caixa', 'Caixa (PDV)'], ['/produtos', 'Produtos'], ['/estoque', 'Estoque'], ['/caixas', 'Caixas'], ['/usuarios', 'Usuários']],
  operador: [['/caixa', 'Caixa'], ['/minhas-vendas', 'Minhas vendas']],
}
const INICIO = { dono: '/painel', operador: '/caixa' }

function Layout() {
  const { perfil, sair } = useAuth()
  return (
    <div className="app">
      <nav className="menu">
        <div className="marca">Adega <span>335</span></div>
        <div className="sub-marca">{perfil.papel === 'dono' ? 'Gestão' : 'Frente de caixa'}</div>
        {MENU[perfil.papel].map(([to, l]) => (
          <NavLink key={to} to={to}>{l}</NavLink>
        ))}
        <div className="quem">
          <span><b>{perfil.nome}</b><br />{perfil.papel === 'dono' ? 'Proprietário' : 'Operador de caixa'}</span>
          <button onClick={sair}>Sair</button>
        </div>
      </nav>
      <main className="conteudo"><Outlet /></main>
    </div>
  )
}

// Guarda de rota: sem login vai pro login; perfil errado volta pro início do perfil.
// (O banco também bloqueia: mesmo forçando a URL, os dados não vêm.)
function Protegida({ papeis }) {
  const { perfil } = useAuth()
  if (!perfil) return <Navigate to="/login" replace />
  if (papeis && !papeis.includes(perfil.papel)) return <Navigate to={INICIO[perfil.papel]} replace />
  return <Outlet />
}

export default function App() {
  const { perfil, carregando } = useAuth()
  if (carregando) return <div className="centro">Carregando…</div>
  return (
    <Routes>
      <Route path="/login" element={perfil ? <Navigate to={INICIO[perfil.papel]} replace /> : <Login />} />
      <Route element={<Protegida />}>
        <Route element={<Layout />}>
          <Route path="/caixa" element={<PDV />} />
          <Route element={<Protegida papeis={['operador']} />}>
            <Route path="/minhas-vendas" element={<MinhasVendas />} />
          </Route>
          <Route element={<Protegida papeis={['dono']} />}>
            <Route path="/painel" element={<Painel />} />
            <Route path="/produtos" element={<Produtos />} />
            <Route path="/estoque" element={<Estoque />} />
            <Route path="/caixas" element={<Caixas />} />
            <Route path="/usuarios" element={<Usuarios />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={perfil ? INICIO[perfil.papel] : '/login'} replace />} />
    </Routes>
  )
}
