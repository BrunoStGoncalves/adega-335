import { useEffect, useState, useCallback } from 'react'
import { supabase, rpc } from '../supabase.js'
import { dataHora, mensagemErro } from '../lib/formato.js'
import { useToast, Toast } from './comum.jsx'

const TIPOS = { entrada: 'Entrada (chegou mercadoria)', saida: 'Saída (perda, consumo, avaria)', ajuste: 'Ajuste (contagem real)' }
const ROTULO = { cadastro: 'Cadastro', entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste', venda: 'Venda' }

export default function Estoque() {
  const [produtos, setProdutos] = useState([])
  const [movs, setMovs] = useState([])
  const [f, setF] = useState({ produto: '', tipo: 'entrada', quantidade: '', motivo: '' })
  const [toast, mostrar] = useToast()

  const carregar = useCallback(async () => {
    const [p, m] = await Promise.all([
      supabase.from('produtos').select('id,nome,estoque,estoque_minimo').eq('ativo', true).eq('eh_combo', false).order('nome'),
      supabase.from('estoque_movimentos').select('id,tipo,quantidade,estoque_depois,motivo,criado_em,produtos(nome),perfis(nome)').order('id', { ascending: false }).limit(100),
    ])
    if (p.error || m.error) return mostrar(mensagemErro(p.error || m.error))
    setProdutos(p.data); setMovs(m.data)
  }, [mostrar])
  useEffect(() => { carregar() }, [carregar])

  const atual = produtos.find((p) => p.id === Number(f.produto))

  async function salvar(e) {
    e.preventDefault()
    const q = parseInt(f.quantidade)
    if (!atual) return mostrar('Escolha o produto.')
    if (!Number.isInteger(q) || q < 0 || (f.tipo !== 'ajuste' && q === 0)) return mostrar('Informe uma quantidade válida.')
    try {
      const novo = await rpc('movimentar_estoque', { p_produto: atual.id, p_tipo: f.tipo, p_quantidade: q, p_motivo: f.motivo || null })
      mostrar(`${atual.nome}: estoque agora é ${novo}`); setF({ ...f, quantidade: '', motivo: '' }); carregar()
    } catch (err) { mostrar(mensagemErro(err)) }
  }

  const baixos = produtos.filter((p) => p.estoque <= p.estoque_minimo)

  return (
    <>
      <div className="topo"><div><h1>Estoque</h1><p className="sub">Toda mudança fica registrada com quem fez.</p></div></div>
      <div className="colunas">
        <form className="card" onSubmit={salvar}>
          <h2>Registrar movimentação</h2>
          <div className="form">
            <label className="largo">Produto<select value={f.produto} onChange={(e) => setF({ ...f, produto: e.target.value })}>
              <option value="">Escolha…</option>{produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} (tem {p.estoque})</option>)}
            </select></label>
            <label className="largo">Tipo<select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              {Object.entries(TIPOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></label>
            <label>{f.tipo === 'ajuste' ? 'Quantidade contada' : 'Quantidade'}<input type="number" min="0" value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} /></label>
            <label>Motivo<input value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Ex.: compra do fornecedor" /></label>
            <button className="btn grande verde largo">Registrar</button>
          </div>
        </form>
        <div className="card">
          <h2>Reposição necessária</h2>
          <table className="tabela"><tbody>
            {baixos.map((p) => <tr key={p.id}><td>{p.nome}</td><td><span className="pilula perigo">{p.estoque} un.</span></td><td className="mini">mínimo {p.estoque_minimo}</td></tr>)}
            {!baixos.length && <tr><td className="vazio">Nada abaixo do mínimo.</td></tr>}
          </tbody></table>
        </div>
      </div>
      <div className="card rolagem">
        <h2>Histórico (últimas 100)</h2>
        <table className="tabela">
          <thead><tr><th>Quando</th><th>Produto</th><th>Tipo</th><th>Qtd.</th><th>Ficou</th><th>Motivo</th><th>Por</th></tr></thead>
          <tbody>{movs.map((m) => (
            <tr key={m.id}><td>{dataHora(m.criado_em)}</td><td>{m.produtos?.nome}</td><td>{ROTULO[m.tipo]}</td>
              <td className={m.quantidade < 0 ? 'perigo' : 'ok'}>{m.quantidade > 0 ? '+' : ''}{m.quantidade}</td><td>{m.estoque_depois}</td>
              <td className="quebra">{m.motivo || '—'}</td><td>{m.perfis?.nome || '—'}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <Toast texto={toast} />
    </>
  )
}
