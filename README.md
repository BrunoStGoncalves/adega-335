[README.md](https://github.com/user-attachments/files/35087556/README.md)
# Adega 335 — Sistema de caixa e gestão

Sistema web de PDV (frente de caixa) e gestão para a Adega 335.

- **Frontend:** React + Vite. Gera um site estático, publicado no GitHub Pages.
- **Banco e login:** Supabase (PostgreSQL + autenticação).
- **Permissões:** validadas no banco com RLS (regras por linha) e funções. O operador não consegue ler custo, lucro, usuários nem relatórios, mesmo chamando a API direto.

## O que o sistema faz

| Proprietário | Operador de caixa |
|---|---|
| Painel: lucro bruto do dia, faturamento, ticket médio, formas de pagamento, mais vendidos, estoque baixo, capital em estoque | Abrir e fechar o próprio caixa |
| Caixa (PDV) | Vender com leitor de código de barras ou busca por nome |
| Produtos e combos: cadastrar, editar, excluir ou inativar | Diminuir e remover itens do carrinho |
| Estoque: entrada, saída, ajuste por contagem e histórico | Troco automático no dinheiro |
| Caixas de todos os operadores e registro de atividades | Sangria e reforço |
| Usuários: cadastrar, ativar ou desativar, trocar perfil, redefinir senha | Ver só as próprias vendas |

Regras garantidas pelo banco:

- Não vende produto sem estoque.
- Combo baixa o estoque dos produtos que o compõem.
- A venda e a baixa de estoque acontecem juntas ou não acontecem.
- O estoque só muda com registro no histórico.
- Produto com vendas é inativado, não apagado, pra manter o histórico.

## Instalação (uma vez)

### 1. Supabase

1. Crie uma conta e uma **organização própria** em supabase.com e, dentro dela, um projeto. Região sugerida: South America (São Paulo).
2. No projeto, abra **SQL Editor**, cole todo o arquivo `supabase/migrations/001_schema.sql` e clique em **Run**. Depois faça o mesmo com `002_fiado_dose.sql` (categoria Dose, fiado e consumo do dono).
3. Em **Authentication → Sign In / Providers → Email**:
   - desligue **Confirm email**;
   - deixe **Allow new users to sign up** ligado. O dono cadastra funcionários por esse fluxo, e qualquer cadastro feito de fora já nasce **desativado**.
4. Em **Authentication → Users → Add user → Create new user**, crie o primeiro acesso, que vira o **proprietário** automaticamente:
   - E-mail: `dono@adega335.local`
   - Senha: escolha uma senha forte
   - Marque **Auto Confirm User**
5. Entre no sistema com o usuário **`dono`** e essa senha. Depois troque o nome em Usuários.
6. Em **Project Settings → API**, copie a **Project URL** e a chave **anon / publishable**. Nunca use a `service_role`.

> O login usa só o "usuário". Por trás, o sistema transforma `juliana` em `juliana@adega335.local`. Esse domínio não precisa existir.

### 2. GitHub Pages

1. Em **Settings → Secrets and variables → Actions → Secrets**, crie:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Em **Settings → Pages → Source**, escolha **GitHub Actions**.
3. Todo push na `main` roda os testes, gera o site e publica.

## Rodar no computador (desenvolvimento)

```bash
npm install
cp .env.example .env.local   # preencha URL e chave
npm run dev
npm test
```

Os testes das regras do banco estão em `supabase/testes/`. Eles rodam num Postgres de teste, nunca no Supabase de produção.

## Leitor de código de barras

Funciona com qualquer leitor USB ou Bluetooth que se comporte como teclado. O campo de leitura fica sempre em foco: é só bipar. Bipar o mesmo produto de novo soma a quantidade no carrinho.

## Limitações conhecidas

- **Não emite nota fiscal (NFC-e).**
- Precisa de internet no caixa.
- No plano gratuito, o Supabase pausa projetos sem uso por cerca de 1 semana e não oferece backup automático pra baixar. Pra uso comercial, avalie o plano pago ou exporte o banco periodicamente.
- Ainda não tem: fichas técnicas de drinks, fornecedores e compras, contas a pagar e relatórios exportáveis (fase 2).
