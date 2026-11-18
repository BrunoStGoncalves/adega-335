import { useEffect, useState } from 'react'
import { supabase, rpc } from '../supabase.js'
import { brl, dataHora, mensagemErro } from '../lib/formato.js'
import { Modal } from './comum.jsx'
import { ResumoCaixa } from './PDV.jsx'

export default function Caixas() {
  const [caixas, setCaixas] = useState(null)
  const [aud, setAud] = useState([])
  const [aberto, setAberto] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('caixas').select('id,aberto_em,fechado_em,valor_inicial,valor_esperado,valor_contado,operador:perfis!caixas_operador_id_fkey(nome)').order('id', { ascending: false }).limit(60),
      supabase.from('auditoria').select('id,acao,detalhes,criado_em,perfis(nome)').order('id', { ascending: false }).limit(60),
    ]).then(([c, a]) => {
      if (c.error) return setErro(mensagemErro(c.error))
      setCaixas(c.data); setAud(a.data || [])
    })
  }, [])

  async function ver(id) {
    try { setAberto(await rpc('resumo_caixa', { p_caixa: id })) } catch (e) { setErro(mensagemErro(e)) }
  }

  return (
    <>
      <div className="topo"><div><h1>Caixas</h1><p className="sub">Aberturas e fechamentos de todos os operadores.</p></div></div>
      {erro && <div className="alerta">{erro}</div>}
      <div className="card rolagem">
        <table className="tabela">
          <thead><tr><th>Nº</th><th>Operador</th><th>Abertura</th><th>Fechamento</th><th>Inicial</th><th>Diferença</th><th></th></tr></thead>
          <tbody>
            {(caixas || []).map((c) => {
              const dif = c.valor_contado !== null ? Number(c.valor_contado) - Number(c.valor_esperado) : null
              return (
                <tr key={c.id}><td>{c.id}</td><td>{c.operador?.nome}</td><td>{dataHora(c.aberto_em)}</td>
                  <td>{c.fechado_em ? dataHora(c.fechado_em) : <span className="pilula ok">Aberto</span>}</td>
                  <td>{brl(c.valor_inicial)}</td>
                  <td className={dif === null ? '' : dif === 0 ? 'ok' : 'perigo'}>{dif === null ? '—' : dif === 0 ? 'Sem diferença' : (dif > 0 ? 'Sobra ' : 'Falta ') + brl(Math.abs(dif))}</td>
                  <td><button className="btn claro pequeno" onClick={() => ver(c.id)}>Detalhes</button></td></tr>
              )
            })}
            {caixas && !caixas.length && <tr><td colSpan="7" className="vazio">Nenhum caixa aberto ainda.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card rolagem">
        <h2>Registro de atividades</h2>
        <table className="tabela">
          <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhes</th></tr></thead>
          <tbody>{aud.map((a) => (
            <tr key={a.id}><td>{dataHora(a.criado_em)}</td><td>{a.perfis?.nome || '—'}</td><td>{a.acao.replace(/_/g, ' ')}</td>
              <td className="quebra mini">{a.detalhes?.produto || a.detalhes?.motivo || (a.detalhes?.valor ? brl(a.detalhes.valor) : '')}</td></tr>
          ))}</tbody>
        </table>
      </div>
      {aberto && <Modal titulo={`Caixa nº ${aberto.id}`} aoFechar={() => setAberto(null)}><ResumoCaixa r={aberto} /></Modal>}
    </>
  )
}
