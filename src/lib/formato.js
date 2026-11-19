// Formatação e leitura de valores em reais
export const brl = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Aceita "10", "10,5", "1.234,56", "R$ 20,00"
export function lerValor(texto) {
  if (texto === null || texto === undefined) return NaN
  if (typeof texto === 'number') return texto
  let s = String(texto).replace(/[R$\s]/g, '')
  if (s === '') return NaN
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

export const pct = (v) => (Number.isFinite(v) ? (v * 100).toFixed(1).replace('.', ',') + '%' : '—')

export const dataHora = (iso) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// Formas que recebem dinheiro na hora
export const FORMAS_RECEBER = { dinheiro: 'Dinheiro', pix: 'PIX', credito: 'Crédito', debito: 'Débito' }
// Todas as opções da tela de venda (fiado cliente = paga depois; fiado dono = consumo do dono)
export const FORMAS = { ...FORMAS_RECEBER, fiado_cliente: 'Fiado cliente', consumo_dono: 'Fiado dono' }

// Início do dia de hoje, de N dias atrás e do mês (horário local)
export function periodo(tipo) {
  const agora = new Date()
  const ini = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  if (tipo === '7d') ini.setDate(ini.getDate() - 6)
  if (tipo === '30d') ini.setDate(ini.getDate() - 29)
  if (tipo === 'mes') ini.setDate(1)
  const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1)
  return { inicio: ini.toISOString(), fim: fim.toISOString() }
}

export function mensagemErro(e) {
  const m = e?.message || String(e)
  if (/Invalid login credentials/i.test(m)) return 'Usuário ou senha incorretos.'
  if (/duplicate key.*codigo_barras/i.test(m)) return 'Já existe um produto com esse código de barras.'
  if (/duplicate key.*codigo_interno/i.test(m)) return 'Já existe um produto com esse código interno.'
  if (/duplicate key.*usuario/i.test(m) || /already registered/i.test(m)) return 'Esse usuário já existe.'
  if (/Failed to fetch/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.'
  return m
}
