// Gaveta de dinheiro (caixa registradora)
//
// A maioria das gavetas abre por um pulso enviado pela impressora térmica (cabo RJ11
// da gaveta ligado na impressora). O comando padrão ESC/POS é: ESC p 0 25 250.
// Aqui ele é enviado pela Web Serial API (Chrome/Edge no computador), que funciona
// com impressoras/gavetas que aparecem como porta serial (COM). Enquanto a gaveta
// não estiver configurada, abrirGaveta() não faz nada e a venda segue normalmente.

const CHAVE = 'adega-gaveta' // preferência deste computador (não é dado do negócio)
export const COMANDO_ABRIR = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa])

export function lerConfig() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) || { ativa: false, baud: 9600 } } catch { return { ativa: false, baud: 9600 } }
}
export function salvarConfig(cfg) {
  try { localStorage.setItem(CHAVE, JSON.stringify(cfg)) } catch { /* sem armazenamento: segue sem gaveta */ }
}

export const suportado = () => typeof navigator !== 'undefined' && 'serial' in navigator

// Pede ao usuário para escolher a porta (só precisa uma vez por computador)
export async function conectar() {
  if (!suportado()) throw new Error('Este navegador não acessa a gaveta. Use Google Chrome ou Microsoft Edge no computador do caixa.')
  await navigator.serial.requestPort()
  salvarConfig({ ...lerConfig(), ativa: true })
}

async function portaSalva() {
  if (!suportado()) return null
  const portas = await navigator.serial.getPorts()
  return portas[0] || null
}

// Abre a gaveta. Retorna true se enviou o comando; nunca trava a venda.
export async function abrirGaveta() {
  const cfg = lerConfig()
  if (!cfg.ativa) return false
  const porta = await portaSalva()
  if (!porta) return false
  try {
    if (!porta.readable) await porta.open({ baudRate: cfg.baud || 9600 })
    const w = porta.writable.getWriter()
    await w.write(COMANDO_ABRIR)
    w.releaseLock()
    await porta.close()
    return true
  } catch (e) {
    console.warn('Gaveta não abriu:', e)
    try { await porta.close() } catch { /* já fechada */ }
    return false
  }
}
