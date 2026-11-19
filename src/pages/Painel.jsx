import { useEffect, useState } from 'react'
import { rpc } from '../supabase.js'
import { brl, pct, periodo, FORMAS_RECEBER, mensagemErro } from '../lib/formato.js'
import { Periodo } from './MinhasVendas.jsx'

export default function Painel() {
  const [p, setP] = useState('hoje')
  const [d, setD] = useState(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    const { inicio, fim } = periodo(p)
    rpc('painel', { p_inicio: inicio, p_fim: fim }).then(setD).catch((e) => setErro(mensagemErro(e)))
  }, [p])
  if (erro) return <div className="alerta">{erro}</div>
  if (!d) return <p>Carregando…</p>
  const fat = Number(d.faturamento)
  const maxDia = Math.max(1, ...d.por_dia.map((x) => Number(x.faturamento)))
  const maxProd = Math.max(1, ...d.mais_vendidos.map((x) => Number(x.quantidade)))
  return (
    <>
      <div className="topo">
        <div><h1>Painel</h1><p className="sub">Lucro bruto = vendas − custo dos produtos vendidos.</p></div>
        <Periodo valor={p} mudar={setP} />
      </div>

      <div className="card destaque">
        <div><span>Lucro bruto de hoje</span><b>{brl(d.hoje.lucro_bruto)}</b></div>
        <div><span>Vendido hoje</span><b>{brl(d.hoje.faturamento)}</b></div>
        <div><span>Vendas hoje</span><b>{d.hoje.qtd_vendas}</b></div>
      </div>

      <div className="kpis">
        <div className="card kpi"><span>Faturamento no período</span><b>{brl(fat)}</b></div>
        <div className="card kpi"><span>Lucro bruto no período</span><b>{brl(d.lucro_bruto)}</b><small>Margem {pct(fat ? d.lucro_bruto / fat : NaN)}</small></div>
        <div className="card kpi"><span>Vendas</span><b>{d.qtd_vendas}</b><small>Ticket médio {brl(d.ticket_medio)}</small></div>
        <div className="card kpi"><span>Fiado a receber</span><b>{brl(d.fiado_aberto.total)}</b><small>{d.fiado_aberto.qtd} fiado(s) em aberto</small></div>
        <div className="card kpi"><span>Fiado dono (consumo)</span><b>{brl(d.consumo_dono.custo)}</b><small>a custo · {d.consumo_dono.qtd} retirada(s) no período</small></div>
        <div className="card kpi"><span>Investido em estoque</span><b>{brl(d.estoque_investido)}</b><small>Vale {brl(d.estoque_valor_venda)} na venda</small></div>
      </div>

      <div className="colunas">
        <div className="card">
          <h2>Faturamento por dia</h2>
          {d.por_dia.length ? (
            <div className="barras-v">
              {d.por_dia.map((x) => (
                <div key={x.dia} title={`${brl(x.faturamento)} · lucro ${brl(x.lucro)}`}>
                  <span className="mini">{brl(x.faturamento).replace(',00', '')}</span>
                  <i style={{ height: `${(Number(x.faturamento) / maxDia) * 140}px` }} />
                  <span className="mini">{x.dia.slice(8, 10)}/{x.dia.slice(5, 7)}</span>
                </div>
              ))}
            </div>
          ) : <p className="vazio">Sem vendas no período.</p>}
        </div>
        <div className="card">
          <h2>Mais vendidos</h2>
          {d.mais_vendidos.map((x) => (
            <div className="barra-h" key={x.nome}>
              <span>{x.nome}</span><i style={{ width: `${(Number(x.quantidade) / maxProd) * 100}%` }} /><span>{x.quantidade} un. · lucro {brl(x.lucro)}</span>
            </div>
          ))}
          {!d.mais_vendidos.length && <p className="vazio">Sem vendas no período.</p>}
        </div>
      </div>

      <div className="colunas">
        <div className="card">
          <h2>Formas de pagamento</h2>
          <table className="tabela"><tbody>
            {Object.entries({ ...FORMAS_RECEBER, fiado_cliente: 'Fiado cliente' }).map(([k, l]) => <tr key={k}><td>{l}</td><td>{brl(d.por_forma[k] || 0)}</td><td>{pct(fat ? (d.por_forma[k] || 0) / fat : NaN)}</td></tr>)}
          </tbody></table>
        </div>
        <div className="card">
          <h2>Estoque baixo</h2>
          <table className="tabela"><tbody>
            {d.estoque_baixo.map((x) => <tr key={x.nome}><td>{x.nome}</td><td><span className="pilula perigo">{x.estoque} un.</span></td><td className="mini">mínimo {x.estoque_minimo}</td></tr>)}
            {!d.estoque_baixo.length && <tr><td className="vazio">Tudo acima do mínimo.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </>
  )
}
