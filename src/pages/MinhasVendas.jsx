import { useEffect, useState } from 'react'
import { rpc } from '../supabase.js'
import { brl, dataHora, FORMAS, periodo, mensagemErro } from '../lib/formato.js'

export default function MinhasVendas() {
  const [p, setP] = useState('hoje')
  const [vendas, setVendas] = useState(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    const { inicio, fim } = periodo(p)
    rpc('minhas_vendas', { p_inicio: inicio, p_fim: fim }).then(setVendas).catch((e) => setErro(mensagemErro(e)))
  }, [p])
  const soma = (vendas || []).reduce((s, v) => s + Number(v.total), 0)
  return (
    <>
      <div className="topo">
        <div><h1>Minhas vendas</h1><p className="sub">Somente as vendas feitas por você.</p></div>
        <Periodo valor={p} mudar={setP} />
      </div>
      {erro && <div className="alerta">{erro}</div>}
      <div className="kpis">
        <div className="card kpi"><span>Vendas</span><b>{vendas?.length ?? '—'}</b></div>
        <div className="card kpi"><span>Total vendido</span><b>{brl(soma)}</b></div>
      </div>
      <div className="card rolagem">
        <table className="tabela">
          <thead><tr><th>Nº</th><th>Quando</th><th>Itens</th><th>Pagamento</th><th>Total</th></tr></thead>
          <tbody>
            {(vendas || []).map((v) => (
              <tr key={v.id}><td>{v.id}</td><td>{dataHora(v.criado_em)}</td>
                <td className="quebra">{(v.itens || []).map((i) => `${i.quantidade}× ${i.nome}`).join(', ')}</td>
                <td>{FORMAS[v.forma_pagamento]}</td><td>{brl(v.total)}</td></tr>
            ))}
            {vendas && !vendas.length && <tr><td colSpan="5" className="vazio">Nenhuma venda no período.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function Periodo({ valor, mudar }) {
  return (
    <div className="abas">
      {[['hoje', 'Hoje'], ['7d', '7 dias'], ['mes', 'Este mês'], ['30d', '30 dias']].map(([k, l]) => (
        <button key={k} className={valor === k ? 'ativa' : ''} onClick={() => mudar(k)}>{l}</button>
      ))}
    </div>
  )
}
