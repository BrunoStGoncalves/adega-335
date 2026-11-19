import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { rpc } from '../supabase.js'
import { brl, lerValor, FORMAS, mensagemErro, dataHora } from '../lib/formato.js'
import { adicionar, alterarQuantidade, remover, subtotal, total, troco, buscarPorCodigo } from '../lib/carrinho.js'
import { useToast, Toast } from './comum.jsx'
import { useAuth } from '../auth.jsx'
import { abrirGaveta, conectar, lerConfig, salvarConfig, suportado } from '../lib/gaveta.js'

export default function PDV() {
  const [caixaId, setCaixaId] = useState(undefined)
  const [aba, setAba] = useState('vender')
  const [toast, mostrar] = useToast()
  const { ehDono } = useAuth()

  const carregarCaixa = useCallback(async () => {
    try { setCaixaId(await rpc('meu_caixa_aberto')) } catch (e) { mostrar(mensagemErro(e)) }
  }, [mostrar])
  useEffect(() => { carregarCaixa() }, [carregarCaixa])

  if (caixaId === undefined) return <p>Carregando…</p>
  if (!caixaId) return <><AbrirCaixa aoAbrir={carregarCaixa} mostrar={mostrar} /><Toast texto={toast} /></>

  return (
    <>
      <div className="topo">
        <div><h1>Caixa</h1><p className="sub">Caixa nº {caixaId} aberto</p></div>
        <div className="abas">
          {[['vender', 'Vender'], ['movimento', 'Sangria / reforço'], ['fechar', 'Fechar caixa'], ...(ehDono ? [['gaveta', 'Gaveta']] : [])].map(([k, l]) => (
            <button key={k} className={aba === k ? 'ativa' : ''} onClick={() => setAba(k)}>{l}</button>
          ))}
        </div>
      </div>
      {aba === 'vender' && <Vender mostrar={mostrar} />}
      {aba === 'movimento' && <Movimento mostrar={mostrar} />}
      {aba === 'gaveta' && <ConfigGaveta mostrar={mostrar} />}
      {aba === 'fechar' && <Fechar mostrar={mostrar} aoFechar={() => { setAba('vender'); carregarCaixa() }} />}
      <Toast texto={toast} />
    </>
  )
}

function AbrirCaixa({ aoAbrir, mostrar }) {
  const [valor, setValor] = useState('')
  async function abrir(e) {
    e.preventDefault()
    const v = lerValor(valor)
    if (!Number.isFinite(v) || v < 0) return mostrar('Informe o dinheiro inicial da gaveta (pode ser 0).')
    try { await rpc('abrir_caixa', { p_valor_inicial: v }); mostrar('Caixa aberto'); aoAbrir() } catch (e) { mostrar(mensagemErro(e)) }
  }
  return (
    <form className="card estreito" onSubmit={abrir}>
      <h1>Abrir caixa</h1>
      <p className="sub">Conte o dinheiro que está na gaveta antes de começar.</p>
      <label>Dinheiro inicial (R$)<input autoFocus inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 150,00" /></label>
      <button className="btn grande verde">Abrir caixa</button>
    </form>
  )
}

function Vender({ mostrar }) {
  const [produtos, setProdutos] = useState([])
  const [carrinho, setCarrinho] = useState([])
  const [busca, setBusca] = useState('')
  const [cat, setCat] = useState('Todas')
  const [forma, setForma] = useState('dinheiro')
  const [recebido, setRecebido] = useState('')
  const [cliente, setCliente] = useState('')
  const [observacao, setObservacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const campo = useRef(null)

  const carregar = useCallback(async () => {
    try { setProdutos(await rpc('produtos_pdv')) } catch (e) { mostrar(mensagemErro(e)) }
  }, [mostrar])
  useEffect(() => { carregar() }, [carregar])

  const focar = () => setTimeout(() => campo.current?.focus(), 0)
  const categorias = useMemo(() => ['Todas', ...new Set(produtos.map((p) => p.categoria))], [produtos])
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return produtos.filter((p) => (cat === 'Todas' || p.categoria === cat) &&
      (!t || p.nome.toLowerCase().includes(t) || (p.codigo_barras || '').includes(t) || (p.codigo_interno || '').toLowerCase().includes(t)))
  }, [produtos, busca, cat])

  function colocar(p) {
    const r = adicionar(carrinho, p)
    if (r.erro) mostrar(r.erro); else mostrar(`${p.nome} adicionado`)
    setCarrinho(r.carrinho); focar()
  }

  // O leitor de código de barras "digita" o código e aperta Enter
  function aoTeclar(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const p = buscarPorCodigo(produtos, busca)
    if (p) { colocar(p); setBusca('') } else mostrar(busca.trim() ? 'Produto não encontrado. Toque nele na lista.' : 'Bipe ou digite um produto.')
  }

  const t = total(carrinho)
  const rec = lerValor(recebido)
  const tr = forma === 'dinheiro' ? troco(t, rec) : null
  const fiado = forma === 'fiado_cliente' || forma === 'consumo_dono'

  async function finalizar() {
    if (!carrinho.length) return
    if (forma === 'dinheiro' && tr !== null && tr < 0) return mostrar('Valor recebido menor que o total.')
    if (forma === 'fiado_cliente' && !cliente.trim()) return mostrar('Informe o nome do cliente do fiado.')
    if (fiado && !observacao.trim()) return mostrar('Descreva o que foi levado nessa operação.')
    setEnviando(true)
    try {
      const r = await rpc('finalizar_venda', {
        p_itens: carrinho.map((i) => ({ produto_id: i.id, quantidade: i.quantidade })),
        p_forma: forma,
        p_valor_recebido: forma === 'dinheiro' && Number.isFinite(rec) ? rec : null,
        p_cliente: forma === 'fiado_cliente' ? cliente.trim() : null,
        p_observacao: fiado ? observacao.trim() : null,
      })
      if (forma === 'dinheiro') abrirGaveta()
      const rotulo = forma === 'fiado_cliente' ? `Fiado de ${cliente.trim()} registrado` : forma === 'consumo_dono' ? 'Consumo do dono registrado' : `Venda nº ${r.venda_id} finalizada`
      mostrar(`${rotulo}: ${brl(r.total)}${Number(r.troco) > 0 ? ' · troco ' + brl(r.troco) : ''}`)
      setCarrinho([]); setRecebido(''); setCliente(''); setObservacao(''); setForma('dinheiro')
      carregar()
    } catch (e) { mostrar(mensagemErro(e)); carregar() } finally { setEnviando(false); focar() }
  }

  return (
    <div className="pdv">
      <div>
        <input ref={campo} className="leitor" autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={aoTeclar}
          placeholder="▮▮▮ Bipe o código ou digite o nome do produto" aria-label="Código de barras ou nome" autoComplete="off" />
        <div className="chips">
          {categorias.map((c) => <button key={c} className={cat === c ? 'ativa' : ''} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <div className="grade">
          {lista.map((p) => (
            <button key={p.id} className="prod" onClick={() => colocar(p)} disabled={p.disponivel <= 0}>
              <b>{p.nome}</b>
              <span className="preco">{brl(p.preco)}</span>
              <span className={p.disponivel <= 3 ? 'estq baixo' : 'estq'}>{p.disponivel <= 0 ? 'Sem estoque' : `${p.disponivel} disponível${p.disponivel > 1 ? 'is' : ''}`}</span>
            </button>
          ))}
          {!lista.length && <p className="vazio">Nenhum produto encontrado.</p>}
        </div>
      </div>

      <aside className="card carrinho">
        <h2>Carrinho</h2>
        {carrinho.length ? carrinho.map((i) => (
          <div className="linha" key={i.id}>
            <div><b>{i.nome}</b><div className="mini">{brl(i.preco)} cada</div></div>
            <b>{brl(subtotal(i))}</b>
            <div className="qtd">
              <button onClick={() => setCarrinho(alterarQuantidade(carrinho, i.id, -1))} aria-label="Diminuir">−</button>
              <b>{i.quantidade}</b>
              <button onClick={() => setCarrinho(alterarQuantidade(carrinho, i.id, +1))} aria-label="Aumentar">+</button>
            </div>
            <button className="link-perigo" onClick={() => setCarrinho(remover(carrinho, i.id))}>Remover</button>
          </div>
        )) : <p className="vazio">Carrinho vazio. Bipe o primeiro produto.</p>}

        <div className="total"><span>TOTAL</span><strong>{brl(t)}</strong></div>
        <div className="formas">
          {Object.entries(FORMAS).map(([k, l]) => <button key={k} className={forma === k ? 'ativa' : ''} onClick={() => setForma(k)}>{l}</button>)}
        </div>
        {fiado && (
          <div className="fiado">
            <p className="mini">{forma === 'fiado_cliente' ? 'O cliente leva agora e paga depois. A dívida fica em Fiados.' : 'Produto retirado pelo dono: baixa o estoque, mas não conta como venda.'}</p>
            {forma === 'fiado_cliente' && <label>Nome do cliente<input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ex.: João da padaria" /></label>}
            <label>Descrição da operação<textarea rows="3" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="O que foi levado e combinado" /></label>
          </div>
        )}
        {forma === 'dinheiro' && (
          <div className="troco">
            <label>Valor recebido<input inputMode="decimal" value={recebido} onChange={(e) => setRecebido(e.target.value)} placeholder="Ex.: 100" /></label>
            <div><div className="mini">Troco</div><div className={tr !== null && tr < 0 ? 'valor perigo' : 'valor ok'}>{tr === null ? '—' : tr < 0 ? 'Falta ' + brl(-tr) : brl(tr)}</div></div>
          </div>
        )}
        <button className="btn grande verde" disabled={!carrinho.length || enviando} onClick={finalizar}>{enviando ? 'Registrando…' : fiado ? 'Registrar ' + FORMAS[forma].toLowerCase() : 'Finalizar venda'}</button>
      </aside>
    </div>
  )
}

function Movimento({ mostrar }) {
  const [tipo, setTipo] = useState('sangria')
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  async function salvar(e) {
    e.preventDefault()
    const v = lerValor(valor)
    if (!Number.isFinite(v) || v <= 0) return mostrar('Informe um valor maior que zero.')
    try { await rpc('movimentar_caixa', { p_tipo: tipo, p_valor: v, p_motivo: motivo || null }); mostrar(tipo === 'sangria' ? 'Sangria registrada' : 'Reforço registrado'); setValor(''); setMotivo('') } catch (e) { mostrar(mensagemErro(e)) }
  }
  return (
    <form className="card estreito" onSubmit={salvar}>
      <h2>Sangria ou reforço</h2>
      <p className="sub">Sangria = tirar dinheiro da gaveta. Reforço = colocar dinheiro (troco).</p>
      <div className="formas">
        <button type="button" className={tipo === 'sangria' ? 'ativa' : ''} onClick={() => setTipo('sangria')}>Sangria</button>
        <button type="button" className={tipo === 'reforco' ? 'ativa' : ''} onClick={() => setTipo('reforco')}>Reforço</button>
      </div>
      <label>Valor (R$)<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
      <label>Motivo (opcional)<input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
      <button className="btn grande">Registrar</button>
    </form>
  )
}

export function ResumoCaixa({ r }) {
  return (
    <table className="tabela">
      <tbody>
        <tr><td>Operador</td><td>{r.operador}</td></tr>
        <tr><td>Aberto em</td><td>{dataHora(r.aberto_em)}</td></tr>
        {r.fechado_em && <tr><td>Fechado em</td><td>{dataHora(r.fechado_em)} por {r.fechado_por}</td></tr>}
        <tr><td>Valor inicial</td><td>{brl(r.valor_inicial)}</td></tr>
        <tr><td>Vendas em dinheiro</td><td>{brl(r.dinheiro)}</td></tr>
        <tr><td>Vendas em PIX</td><td>{brl(r.pix)}</td></tr>
        <tr><td>Vendas no crédito</td><td>{brl(r.credito)}</td></tr>
        <tr><td>Vendas no débito</td><td>{brl(r.debito)}</td></tr>
        <tr><td>Fiado cliente (a receber)</td><td>{brl(r.fiado_cliente)}</td></tr>
        <tr><td>Fiados recebidos em dinheiro</td><td>{brl(r.fiado_recebido_dinheiro)}</td></tr>
        <tr><td>Fiados recebidos em PIX/cartão</td><td>{brl(r.fiado_recebido_outros)}</td></tr>
        <tr><td>Fiado dono (consumo)</td><td>{brl(r.consumo_dono)}</td></tr>
        <tr><td>Sangrias</td><td>− {brl(r.sangrias)}</td></tr>
        <tr><td>Reforços</td><td>{brl(r.reforcos)}</td></tr>
        <tr><td><b>Dinheiro esperado na gaveta</b></td><td><b>{brl(r.valor_esperado)}</b></td></tr>
        {r.valor_contado !== null && r.valor_contado !== undefined && <>
          <tr><td>Valor contado</td><td>{brl(r.valor_contado)}</td></tr>
          <tr><td><b>Diferença</b></td><td className={Number(r.diferenca) === 0 ? 'ok' : 'perigo'}><b>{Number(r.diferenca) === 0 ? 'Sem diferença' : (r.diferenca > 0 ? 'Sobra ' : 'Falta ') + brl(Math.abs(r.diferenca))}</b></td></tr>
        </>}
      </tbody>
    </table>
  )
}

function Fechar({ mostrar, aoFechar }) {
  const [r, setR] = useState(null)
  const [contado, setContado] = useState('')
  const [final, setFinal] = useState(null)
  useEffect(() => { rpc('resumo_caixa', {}).then(setR).catch((e) => mostrar(mensagemErro(e))) }, [mostrar])
  async function fechar(e) {
    e.preventDefault()
    const v = lerValor(contado)
    if (!Number.isFinite(v) || v < 0) return mostrar('Informe quanto dinheiro há na gaveta.')
    try { setFinal(await rpc('fechar_caixa', { p_valor_contado: v })) } catch (e) { mostrar(mensagemErro(e)) }
  }
  if (final) return (
    <div className="card estreito">
      <h2>Caixa fechado</h2>
      <ResumoCaixa r={final} />
      <button className="btn grande" onClick={aoFechar}>Concluir</button>
    </div>
  )
  if (!r) return <p>Carregando…</p>
  return (
    <form className="card estreito" onSubmit={fechar}>
      <h2>Fechar caixa</h2>
      <ResumoCaixa r={r} />
      <label>Dinheiro contado na gaveta (R$)<input inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} /></label>
      <button className="btn grande verde">Fechar caixa</button>
    </form>
  )
}

function ConfigGaveta({ mostrar }) {
  const [cfg, setCfg] = useState(lerConfig())
  const ok = suportado()
  async function ligar() {
    try { await conectar(); setCfg(lerConfig()); mostrar('Gaveta conectada neste computador') } catch (e) { mostrar(mensagemErro(e)) }
  }
  function desligar() { const c = { ...cfg, ativa: false }; salvarConfig(c); setCfg(c); mostrar('Abertura automática desligada') }
  async function testar() { mostrar((await abrirGaveta()) ? 'Comando enviado para a gaveta' : 'A gaveta não respondeu. Confira a conexão.') }
  return (
    <div className="card estreito">
      <h2>Gaveta de dinheiro</h2>
      <p className="sub">Quando ativa, a gaveta abre sozinha ao finalizar uma venda em dinheiro.</p>
      {!ok && <div className="alerta">Este navegador não acessa a gaveta. Use Google Chrome ou Microsoft Edge no computador do caixa.</div>}
      <p>Situação neste computador: <b>{cfg.ativa ? 'ativa' : 'desligada'}</b></p>
      <label>Velocidade da porta (baud)
        <select value={cfg.baud} onChange={(e) => { const c = { ...cfg, baud: Number(e.target.value) }; salvarConfig(c); setCfg(c) }}>
          {[9600, 19200, 38400, 115200].map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>
      <button className="btn grande" disabled={!ok} onClick={ligar}>Conectar gaveta</button>
      <button className="btn grande claro" disabled={!cfg.ativa} onClick={testar}>Testar abertura</button>
      {cfg.ativa && <button className="btn claro" onClick={desligar}>Desligar abertura automática</button>}
      <p className="mini">Funciona com gavetas ligadas à impressora térmica ou a uma porta serial/USB-serial. O modelo exato muda a configuração: confira quando a gaveta chegar.</p>
    </div>
  )
}
