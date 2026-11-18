// Regras do carrinho (funções puras, testadas em carrinho.test.js)

// Adiciona 1 unidade. Produto repetido soma a quantidade em vez de duplicar a linha.
// Não deixa passar do disponível em estoque.
export function adicionar(carrinho, produto) {
  const atual = carrinho.find((i) => i.id === produto.id)
  const qtd = (atual?.quantidade || 0) + 1
  if (qtd > produto.disponivel) {
    return { carrinho, erro: produto.disponivel <= 0 ? `${produto.nome} está sem estoque.` : `Só há ${produto.disponivel} de ${produto.nome} em estoque.` }
  }
  if (atual) return { carrinho: carrinho.map((i) => (i.id === produto.id ? { ...i, quantidade: qtd } : i)) }
  return { carrinho: [...carrinho, { id: produto.id, nome: produto.nome, preco: Number(produto.preco), quantidade: 1, disponivel: produto.disponivel }] }
}

export function alterarQuantidade(carrinho, id, delta) {
  return carrinho
    .map((i) => (i.id === id ? { ...i, quantidade: Math.min(i.quantidade + delta, i.disponivel) } : i))
    .filter((i) => i.quantidade > 0)
}

export const remover = (carrinho, id) => carrinho.filter((i) => i.id !== id)

export const subtotal = (item) => Math.round(item.preco * item.quantidade * 100) / 100

export const total = (carrinho) => Math.round(carrinho.reduce((s, i) => s + i.preco * i.quantidade, 0) * 100) / 100

// Troco: null se não informado; negativo = falta dinheiro
export function troco(totalVenda, recebido) {
  if (!Number.isFinite(recebido)) return null
  return Math.round((recebido - totalVenda) * 100) / 100
}

// Encontra produto pelo que foi bipado ou digitado (código de barras, código interno ou nome)
export function buscarPorCodigo(produtos, texto) {
  const t = String(texto || '').trim().toLowerCase()
  if (!t) return null
  const exato = produtos.find((p) => p.codigo_barras === t || (p.codigo_interno || '').toLowerCase() === t)
  if (exato) return exato
  const porNome = produtos.filter((p) => p.nome.toLowerCase().includes(t))
  return porNome.length === 1 ? porNome[0] : null
}
