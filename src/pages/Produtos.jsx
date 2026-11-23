import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase, rpc } from '../supabase.js'
import { brl, pct, lerValor, mensagemErro } from '../lib/formato.js'
import { useToast, Toast, Modal } from './comum.jsx'

const VAZIO = { nome: '', categoria_id: '', marca: '', codigo_barras: '', codigo_interno: '', descricao: '', custo: '', preco: '', estoque: '0', estoque_minimo: '0', eh_combo: false, itens: [] }

export default function Produtos() {
  const [lista, setLista] = useState([])
  const [cats, setCats] = useState([])
  const [busca, setBusca] = useState('')
  const [cat, setCat] = useState('')
  const [inativos, setInativos] = useState(false)
  const [edit, setEdit] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [toast, mostrar] = useToast()

  const carregar = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from('produtos').select('*, categorias(nome), combo_itens!combo_itens_combo_id_fkey(produto_id, quantidade)').order('nome'),
      supabase.from('categorias').select('*').order('nome'),
    ])
    if (p.error) return mostrar(mensagemErro(p.error))
    setLista(p.data); setCats(c.data || [])
  }, [mostrar])
  useEffect(() => { carregar() }, [carregar])

  const porId = useMemo(() => Object.fromEntries(lista.map((p) => [p.id, p])), [lista])
  const custoCombo = (itens) => itens.reduce((s, i) => s + Number(porId[i.produto_id]?.custo || 0) * i.quantidade, 0)
  const custoDe = (p) => (p.eh_combo ? custoCombo(p.combo_itens || []) : Number(p.custo))

  const filtrada = lista.filter((p) => (inativos || p.ativo) && (!cat || p.categoria_id === Number(cat)) &&
    (!busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || (p.codigo_barras || '').includes(busca) || (p.codigo_interno || '').toLowerCase().includes(busca.toLowerCase())))

  async function excluir(p) {
    try {
      const r = await rpc('excluir_produto', { p_produto: p.id })
      mostrar(r === 'excluido' ? `${p.nome} excluído` : `${p.nome} tem histórico de vendas, então foi inativado (some do caixa, mas o histórico fica).`)
      setConfirmar(null); carregar()
    } catch (e) { mostrar(mensagemErro(e)); setConfirmar(null) }
  }

  async function reativar(p) {
    const { error } = await supabase.from('produtos').update({ ativo: true }).eq('id', p.id)
    if (error) mostrar(mensagemErro(error)); else { mostrar(`${p.nome} reativado`); carregar() }
  }

  return (
    <>
      <div className="topo">
        <div><h1>Produtos</h1><p className="sub">{lista.filter((p) => p.ativo).length} produtos ativos</p></div>
        <button className="btn" onClick={() => setEdit({ ...VAZIO, categoria_id: cats[0]?.id || '' })}>+ Novo produto</button>
      </div>
      <div className="filtros">
        <input placeholder="Buscar por nome ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Todas as categorias</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
        <label className="check"><input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} /> Mostrar inativos</label>
      </div>
      <div className="card rolagem">
        <table className="tabela">
          <thead><tr><th>Produto</th><th>Categoria</th><th>Código</th><th>Custo</th><th>Venda</th><th>Margem</th><th>Estoque</th><th></th></tr></thead>
          <tbody>
            {filtrada.map((p) => {
              const c = custoDe(p)
              return (
                <tr key={p.id} className={p.ativo ? '' : 'inativo'}>
                  <td><b>{p.nome}</b>{p.marca && <div className="mini">{p.marca}</div>}{p.eh_combo && <span className="pilula">Combo</span>}</td>
                  <td>{p.categorias?.nome}</td>
                  <td>{p.codigo_barras || p.codigo_interno ? <>{p.codigo_barras && <div>{p.codigo_barras}</div>}{p.codigo_interno && <div className="mini">Interno: {p.codigo_interno}</div>}</> : '—'}</td>
                  <td>{brl(c)}</td><td>{brl(p.preco)}</td><td>{pct(p.preco > 0 ? (p.preco - c) / p.preco : NaN)}</td>
                  <td>{p.eh_combo ? <span className="mini">usa os itens</span> : <span className={p.estoque <= p.estoque_minimo ? 'pilula perigo' : ''}>{p.estoque}</span>}</td>
                  <td className="acoes">
                    {p.ativo ? <>
                      <button className="btn claro pequeno" onClick={() => setEdit({ ...p, custo: String(p.custo).replace('.', ','), preco: String(p.preco).replace('.', ','), estoque: String(p.estoque), estoque_minimo: String(p.estoque_minimo), itens: (p.combo_itens || []).map((i) => ({ ...i })) })}>Editar</button>
                      <button className="btn claro pequeno perigo" onClick={() => setConfirmar(p)}>Excluir</button>
                    </> : <button className="btn claro pequeno" onClick={() => reativar(p)}>Reativar</button>}
                  </td>
                </tr>
              )
            })}
            {!filtrada.length && <tr><td colSpan="8" className="vazio">Nenhum produto. Clique em “Novo produto”.</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && <Formulario inicial={edit} cats={cats} produtos={lista.filter((p) => !p.eh_combo && p.ativo)} custoCombo={custoCombo}
        aoFechar={() => setEdit(null)} aoSalvar={(msg) => { setEdit(null); mostrar(msg); carregar() }} mostrar={mostrar} />}
      {confirmar && (
        <Modal titulo="Excluir produto" aoFechar={() => setConfirmar(null)}>
          <p>Excluir <b>{confirmar.nome}</b>? Se ele já tiver vendas, será apenas inativado para manter o histórico.</p>
          <button className="btn grande perigo-cheio" onClick={() => excluir(confirmar)}>Sim, excluir</button>
        </Modal>
      )}
      <Toast texto={toast} />
    </>
  )
}

function Formulario({ inicial, cats, produtos, custoCombo, aoFechar, aoSalvar, mostrar }) {
  const [f, setF] = useState(inicial)
  const [salvando, setSalvando] = useState(false)
  const novo = !inicial.id
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const custo = f.eh_combo ? custoCombo(f.itens) : lerValor(f.custo)
  const preco = lerValor(f.preco)

  async function salvar(e) {
    e.preventDefault()
    if (!f.nome.trim()) return mostrar('Informe o nome.')
    if (!Number.isFinite(preco) || preco < 0) return mostrar('Informe o preço de venda.')
    if (!f.eh_combo && (!Number.isFinite(custo) || custo < 0)) return mostrar('Informe o custo de aquisição.')
    if (f.eh_combo && f.itens.filter((i) => i.produto_id).length < 2) return mostrar('Um combo precisa de pelo menos 2 produtos.')
    const dados = {
      nome: f.nome.trim(), categoria_id: Number(f.categoria_id), marca: f.marca || null,
      codigo_barras: f.codigo_barras?.trim() || null, codigo_interno: f.codigo_interno?.trim() || null, descricao: f.descricao || null,
      custo: f.eh_combo ? 0 : custo, preco, estoque_minimo: parseInt(f.estoque_minimo) || 0, eh_combo: f.eh_combo,
    }
    setSalvando(true)
    try {
      let id = inicial.id
      if (novo) {
        const est = f.eh_combo ? 0 : parseInt(f.estoque) || 0
        const { data, error } = await supabase.from('produtos').insert({ ...dados, estoque: est }).select('id').single()
        if (error) throw error
        id = data.id
      } else {
        const { error } = await supabase.from('produtos').update(dados).eq('id', id)
        if (error) throw error
      }
      if (f.eh_combo) {
        const { error: e1 } = await supabase.from('combo_itens').delete().eq('combo_id', id)
        if (e1) throw e1
        const itens = Object.values(f.itens.filter((i) => i.produto_id).reduce((acc, i) => {
          const k = Number(i.produto_id); acc[k] = { combo_id: id, produto_id: k, quantidade: (acc[k]?.quantidade || 0) + (parseInt(i.quantidade) || 1) }; return acc
        }, {}))
        const { error: e2 } = await supabase.from('combo_itens').insert(itens)
        if (e2) throw e2
      }
      aoSalvar(novo ? `${dados.nome} cadastrado` : `${dados.nome} atualizado`)
    } catch (err) { mostrar(mensagemErro(err)) } finally { setSalvando(false) }
  }

  const mudarItem = (idx, k, v) => setF({ ...f, itens: f.itens.map((i, j) => (j === idx ? { ...i, [k]: v } : i)) })

  return (
    <Modal titulo={novo ? 'Novo produto' : 'Editar produto'} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="form">
        <label className="largo">Nome<input autoFocus value={f.nome} onChange={set('nome')} /></label>
        <label>Categoria<select value={f.categoria_id} onChange={set('categoria_id')}>{cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
        <label>Marca<input value={f.marca || ''} onChange={set('marca')} /></label>
        <label>Código de barras<input value={f.codigo_barras || ''} onChange={set('codigo_barras')} placeholder="Bipe aqui" /></label>
        <label>Código interno<input value={f.codigo_interno || ''} onChange={set('codigo_interno')} /></label>
        <label className="check largo"><input type="checkbox" checked={f.eh_combo} disabled={!novo} onChange={set('eh_combo')} /> É um combo (vários produtos vendidos juntos)</label>

        {f.eh_combo ? (
          <div className="largo">
            <b>Produtos do combo</b>
            {f.itens.map((i, idx) => (
              <div className="item-combo" key={idx}>
                <select value={i.produto_id || ''} onChange={(e) => mudarItem(idx, 'produto_id', e.target.value)}>
                  <option value="">Escolha um produto</option>
                  {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} ({brl(p.preco)})</option>)}
                </select>
                <input type="number" min="1" value={i.quantidade} onChange={(e) => mudarItem(idx, 'quantidade', e.target.value)} aria-label="Quantidade" />
                <button type="button" className="btn claro pequeno" onClick={() => setF({ ...f, itens: f.itens.filter((_, j) => j !== idx) })}>Tirar</button>
              </div>
            ))}
            <button type="button" className="btn claro pequeno" onClick={() => setF({ ...f, itens: [...f.itens, { produto_id: '', quantidade: 1 }] })}>+ Adicionar produto ao combo</button>
            <p className="mini">Preço dos itens separados: {brl(f.itens.reduce((s, i) => s + Number(produtos.find((p) => p.id === Number(i.produto_id))?.preco || 0) * (parseInt(i.quantidade) || 0), 0))} · Custo do combo: {brl(custo)}</p>
          </div>
        ) : (
          <label>Custo de aquisição (R$)<input inputMode="decimal" value={f.custo} onChange={set('custo')} /></label>
        )}
        <label>Preço de venda (R$)<input inputMode="decimal" value={f.preco} onChange={set('preco')} /></label>
        <div className="margem">Margem: <b>{pct(preco > 0 && Number.isFinite(custo) ? (preco - custo) / preco : NaN)}</b> · lucro por unidade {Number.isFinite(preco - custo) ? brl(preco - custo) : '—'}</div>
        {!f.eh_combo && <>
          {novo ? <label>Estoque inicial<input type="number" min="0" value={f.estoque} onChange={set('estoque')} /></label>
            : <p className="mini">Estoque atual: {inicial.estoque}. Para mudar, use a tela Estoque.</p>}
          <label>Estoque mínimo (alerta)<input type="number" min="0" value={f.estoque_minimo} onChange={set('estoque_minimo')} /></label>
        </>}
        <label className="largo">Descrição<input value={f.descricao || ''} onChange={set('descricao')} /></label>
        <button className="btn grande verde largo" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </form>
    </Modal>
  )
}
