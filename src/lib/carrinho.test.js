import { describe, it, expect } from 'vitest'
import { adicionar, alterarQuantidade, remover, total, troco, buscarPorCodigo } from './carrinho.js'
import { lerValor } from './formato.js'

const vodka = { id: 1, nome: 'Vodka', preco: 45, disponivel: 3, codigo_barras: '789001' }
const redbull = { id: 2, nome: 'Red Bull', preco: 15, disponivel: 10, codigo_barras: '789002' }
const salg = { id: 3, nome: 'Salgadinho', preco: 8, disponivel: 0, codigo_barras: '789003' }

describe('carrinho', () => {
  it('soma a quantidade quando o mesmo produto é bipado de novo', () => {
    let c = adicionar([], vodka).carrinho
    c = adicionar(c, vodka).carrinho
    expect(c).toHaveLength(1)
    expect(c[0].quantidade).toBe(2)
  })
  it('calcula o total (exemplo do pedido: 45 + 15 + 8 = 68)', () => {
    let c = adicionar([], vodka).carrinho
    c = adicionar(c, redbull).carrinho
    c.push({ id: 3, nome: 'Salgadinho', preco: 8, quantidade: 1, disponivel: 5 })
    expect(total(c)).toBe(68)
  })
  it('não deixa adicionar produto sem estoque', () => {
    const r = adicionar([], salg)
    expect(r.erro).toMatch(/sem estoque/)
    expect(r.carrinho).toHaveLength(0)
  })
  it('não passa do estoque disponível', () => {
    let c = []
    for (let i = 0; i < 5; i++) c = adicionar(c, vodka).carrinho
    expect(c[0].quantidade).toBe(3)
    expect(alterarQuantidade(c, 1, +1)[0].quantidade).toBe(3)
  })
  it('diminuir até zero remove o item; remover tira a linha', () => {
    let c = adicionar([], vodka).carrinho
    expect(alterarQuantidade(c, 1, -1)).toHaveLength(0)
    c = adicionar(c, redbull).carrinho
    expect(remover(c, 1).map((i) => i.id)).toEqual([2])
  })
})

describe('troco', () => {
  it('calcula troco e falta', () => {
    expect(troco(68, 100)).toBe(32)
    expect(troco(68, 50)).toBe(-18)
    expect(troco(68, NaN)).toBeNull()
  })
  it('lê valores digitados em reais', () => {
    expect(lerValor('1.234,56')).toBe(1234.56)
    expect(lerValor('R$ 20,00')).toBe(20)
    expect(lerValor('10.5')).toBe(10.5)
    expect(lerValor('')).toBeNaN()
  })
})

describe('leitor de código de barras', () => {
  const lista = [vodka, redbull, salg]
  it('acha pelo código exato', () => expect(buscarPorCodigo(lista, '789002')).toBe(redbull))
  it('acha pelo nome quando só há um resultado', () => expect(buscarPorCodigo(lista, 'vod')).toBe(vodka))
  it('não escolhe quando o nome é ambíguo ou não existe', () => {
    expect(buscarPorCodigo(lista, 'a')).toBeNull()
    expect(buscarPorCodigo(lista, '000')).toBeNull()
  })
})
