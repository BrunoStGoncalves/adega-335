import { useEffect, useState, useCallback } from 'react'
import { rpc } from '../supabase.js'
import { brl, dataHora, FORMAS_RECEBER, mensagemErro } from '../lib/formato.js'
import { abrirGaveta } from '../lib/gaveta.js'
import { useToast, Toast, Modal } from './comum.jsx'

export default function Fiados() {
  const [abertos, setAbertos] = useState(true)
  const [lista, setLista] = useState(null)
  const [busca, setBusca] = useState('')
  const [receber, setReceber] = useState(null)
  const [forma, setForma] = useState('dinheiro')
  const [toast, mostrar] = useToast()

  const carregar = useCallback(async () => {
    try { setLista(await rpc('fiados', { p_abertos: abertos })) } catch (e) { mostrar(mensagemErro(e)) }
  }, [abertos, mostrar])
  useEffect(() => { carregar() }, [carregar])

  const filtrada = (lista || []).filter((f) => !busca || (f.cliente_nome || '').toLowerCase().includes(busca.toLowerCase()))
  const totalAberto = filtrada.reduce((s, f) => s + Number(f.total), 0)

  async function confirmar() {
    try {
      await rpc('quitar_fiado', { p_venda: receber.id, p_forma: forma })
      if (forma === 'dinheiro') abrirGaveta()
      mostrar(`Fiado de ${receber.cliente_nome} recebido: ${brl(receber.total)}`)
      setReceber(null); carregar()
    } catch (e) { mostrar(mensagemErro(e)) }
  }

  return (
    <>
      <div className="topo">
        <div><h1>Fiados</h1><p className="sub">Clientes que levaram e vão pagar depois.</p></div>
        <div className="abas">
          <button className={abertos ? 'ativa' : ''} onClick={() => setAbertos(true)}>Em aberto</button>
          <button className={!abertos ? 'ativa' : ''} onClick={() => setAbertos(false)}>Pagos</button>
        </div>
      </div>
      <div className="filtros"><input placeholder="Buscar pelo nome do cliente" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
      {abertos && <div className="card kpi"><span>Total a receber{busca ? ' (filtro)' : ''}</span><b>{brl(totalAberto)}</b></div>}
      <div className="card rolagem">
        <table className="tabela">
          <thead><tr><th>Data</th><th>Cliente</th><th>Itens</th><th>Descrição</th><th>Valor</th><th>{abertos ? 'Registrado por' : 'Pago'}</th><th></th></tr></thead>
          <tbody>
            {filtrada.map((f) => (
              <tr key={f.id}>
                <td>{dataHora(f.criado_em)}</td><td><b>{f.cliente_nome}</b></td>
                <td className="quebra">{(f.itens || []).map((i) => `${i.quantidade}× ${i.nome}`).join(', ')}</td>
                <td className="quebra mini">{f.observacao}</td><td>{brl(f.total)}</td>
                <td>{abertos ? f.operador : `${dataHora(f.quitado_em)} · ${FORMAS_RECEBER[f.fiado_forma] || ''} · ${f.quitado_por}`}</td>
                <td>{abertos && <button className="btn pequeno" onClick={() => { setForma('dinheiro'); setReceber(f) }}>Receber</button>}</td>
              </tr>
            ))}
            {lista && !filtrada.length && <tr><td colSpan="7" className="vazio">{abertos ? 'Nenhum fiado em aberto.' : 'Nenhum fiado pago ainda.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {receber && (
        <Modal titulo={`Receber fiado de ${receber.cliente_nome}`} aoFechar={() => setReceber(null)}>
          <p>Valor: <b>{brl(receber.total)}</b>. O pagamento entra no seu caixa aberto.</p>
          <div className="formas">
            {Object.entries(FORMAS_RECEBER).map(([k, l]) => <button key={k} className={forma === k ? 'ativa' : ''} onClick={() => setForma(k)}>{l}</button>)}
          </div>
          <p />
          <button className="btn grande verde" onClick={confirmar}>Confirmar recebimento</button>
        </Modal>
      )}
      <Toast texto={toast} />
    </>
  )
}
