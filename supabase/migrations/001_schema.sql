-- =====================================================================
-- Adega 335 — Estrutura do banco de dados (PostgreSQL / Supabase)
-- Rode este arquivo inteiro uma única vez no SQL Editor do Supabase.
-- Todas as regras de permissão ficam AQUI (no banco), não só nas telas.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  usuario text not null unique,
  papel text not null default 'operador' check (papel in ('dono','operador')),
  ativo boolean not null default false,
  criado_em timestamptz not null default now()
);

create table public.categorias (
  id bigint generated always as identity primary key,
  nome text not null unique
);

create table public.produtos (
  id bigint generated always as identity primary key,
  nome text not null,
  categoria_id bigint not null references public.categorias(id),
  marca text,
  codigo_barras text unique,
  codigo_interno text unique,
  descricao text,
  custo numeric(12,2) not null default 0 check (custo >= 0),
  preco numeric(12,2) not null check (preco >= 0),
  estoque integer not null default 0 check (estoque >= 0),
  estoque_minimo integer not null default 0 check (estoque_minimo >= 0),
  eh_combo boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index on public.produtos (categoria_id);
create index on public.produtos (lower(nome));

-- Componentes de um combo (o combo não tem estoque próprio)
create table public.combo_itens (
  combo_id bigint not null references public.produtos(id) on delete cascade,
  produto_id bigint not null references public.produtos(id),
  quantidade integer not null check (quantidade > 0),
  primary key (combo_id, produto_id),
  check (combo_id <> produto_id)
);

create table public.caixas (
  id bigint generated always as identity primary key,
  operador_id uuid not null references public.perfis(id),
  aberto_em timestamptz not null default now(),
  valor_inicial numeric(12,2) not null check (valor_inicial >= 0),
  fechado_em timestamptz,
  fechado_por uuid references public.perfis(id),
  valor_esperado numeric(12,2),
  valor_contado numeric(12,2)
);
-- Cada operador só pode ter um caixa aberto por vez
create unique index caixa_aberto_unico on public.caixas (operador_id) where fechado_em is null;

create table public.caixa_movimentos (
  id bigint generated always as identity primary key,
  caixa_id bigint not null references public.caixas(id),
  tipo text not null check (tipo in ('sangria','reforco')),
  valor numeric(12,2) not null check (valor > 0),
  motivo text,
  usuario_id uuid not null references public.perfis(id),
  criado_em timestamptz not null default now()
);

create table public.vendas (
  id bigint generated always as identity primary key,
  caixa_id bigint not null references public.caixas(id),
  operador_id uuid not null references public.perfis(id),
  total numeric(12,2) not null,
  custo_total numeric(12,2) not null,
  forma_pagamento text not null check (forma_pagamento in ('dinheiro','pix','credito','debito')),
  valor_recebido numeric(12,2),
  troco numeric(12,2) not null default 0,
  criado_em timestamptz not null default now()
);
create index on public.vendas (criado_em);
create index on public.vendas (operador_id);

create table public.venda_itens (
  id bigint generated always as identity primary key,
  venda_id bigint not null references public.vendas(id) on delete cascade,
  produto_id bigint not null references public.produtos(id),
  nome text not null,
  quantidade integer not null check (quantidade > 0),
  preco_unit numeric(12,2) not null,
  custo_unit numeric(12,2) not null
);
create index on public.venda_itens (produto_id);

create table public.estoque_movimentos (
  id bigint generated always as identity primary key,
  produto_id bigint not null references public.produtos(id),
  tipo text not null check (tipo in ('cadastro','entrada','saida','ajuste','venda')),
  quantidade integer not null,          -- positivo entra, negativo sai
  estoque_depois integer not null,
  motivo text,
  usuario_id uuid references public.perfis(id),
  venda_id bigint references public.vendas(id),
  criado_em timestamptz not null default now()
);
create index on public.estoque_movimentos (produto_id, criado_em);

create table public.auditoria (
  id bigint generated always as identity primary key,
  usuario_id uuid references public.perfis(id),
  acao text not null,
  detalhes jsonb,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Funções auxiliares de permissão
-- ---------------------------------------------------------------------
create or replace function public.usuario_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and ativo);
$$;

create or replace function public.eh_dono() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and ativo and papel = 'dono');
$$;

create or replace function public.exigir_ativo() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not usuario_ativo() then raise exception 'Acesso negado: usuário inativo ou não autenticado.'; end if;
end $$;

create or replace function public.exigir_dono() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not eh_dono() then raise exception 'Acesso negado: somente o proprietário pode fazer isso.'; end if;
end $$;

create or replace function public.registrar_auditoria(p_acao text, p_detalhes jsonb) returns void
language sql security definer set search_path = public as $$
  insert into auditoria (usuario_id, acao, detalhes) values (auth.uid(), p_acao, p_detalhes);
$$;

-- ---------------------------------------------------------------------
-- Novo usuário do Auth => cria perfil.
-- O PRIMEIRO usuário do sistema vira dono ativo. Os demais nascem
-- operadores INATIVOS; só o dono ativa. Assim um cadastro público
-- nunca ganha acesso nem vira administrador.
-- ---------------------------------------------------------------------
create or replace function public.criar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare primeiro boolean;
begin
  select not exists (select 1 from perfis) into primeiro;
  insert into perfis (id, nome, usuario, papel, ativo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)),
    lower(coalesce(new.raw_user_meta_data->>'usuario', split_part(new.email,'@',1))),
    case when primeiro then 'dono' else 'operador' end,
    primeiro
  );
  return new;
end $$;

create trigger ao_criar_usuario after insert on auth.users
for each row execute function public.criar_perfil();

-- ---------------------------------------------------------------------
-- Estoque não muda "em silêncio": só por funções que registram histórico
-- ---------------------------------------------------------------------
create or replace function public.proteger_estoque() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estoque is distinct from old.estoque
     and coalesce(current_setting('adega.mov_estoque', true), '') <> 'sim' then
    raise exception 'O estoque só pode ser alterado pela tela de Estoque ou por vendas.';
  end if;
  if new.preco is distinct from old.preco or new.custo is distinct from old.custo then
    perform registrar_auditoria('alterou_preco', jsonb_build_object(
      'produto', new.nome, 'preco_antes', old.preco, 'preco_depois', new.preco,
      'custo_antes', old.custo, 'custo_depois', new.custo));
  end if;
  return new;
end $$;
create trigger produtos_proteger_estoque before update on public.produtos
for each row execute function public.proteger_estoque();

create or replace function public.estoque_inicial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.eh_combo and new.estoque <> 0 then
    raise exception 'Combo não tem estoque próprio: o estoque vem dos produtos que o compõem.';
  end if;
  insert into estoque_movimentos (produto_id, tipo, quantidade, estoque_depois, motivo, usuario_id)
  values (new.id, 'cadastro', new.estoque, new.estoque, 'Estoque inicial no cadastro', auth.uid());
  perform registrar_auditoria('cadastrou_produto', jsonb_build_object('produto', new.nome, 'preco', new.preco));
  return new;
end $$;
create trigger produtos_estoque_inicial after insert on public.produtos
for each row execute function public.estoque_inicial();

-- ---------------------------------------------------------------------
-- RLS (Row Level Security: regras de quem lê/escreve cada linha)
-- ---------------------------------------------------------------------
alter table public.perfis enable row level security;
alter table public.categorias enable row level security;
alter table public.produtos enable row level security;
alter table public.combo_itens enable row level security;
alter table public.caixas enable row level security;
alter table public.caixa_movimentos enable row level security;
alter table public.vendas enable row level security;
alter table public.venda_itens enable row level security;
alter table public.estoque_movimentos enable row level security;
alter table public.auditoria enable row level security;

create policy perfis_ler on public.perfis for select to authenticated
  using (id = auth.uid() or eh_dono());

create policy categorias_ler on public.categorias for select to authenticated using (usuario_ativo());
create policy categorias_dono on public.categorias for all to authenticated using (eh_dono()) with check (eh_dono());

-- Produtos (com custo) e combos: só o dono lê ou escreve direto.
-- O operador vê os produtos SEM custo pela função produtos_pdv().
create policy produtos_dono on public.produtos for all to authenticated using (eh_dono()) with check (eh_dono());
create policy combo_dono on public.combo_itens for all to authenticated using (eh_dono()) with check (eh_dono());

create policy caixas_ler on public.caixas for select to authenticated
  using (eh_dono() or (operador_id = auth.uid() and usuario_ativo()));
create policy caixa_mov_ler on public.caixa_movimentos for select to authenticated
  using (eh_dono() or exists (select 1 from caixas c where c.id = caixa_id and c.operador_id = auth.uid() and usuario_ativo()));

create policy vendas_dono on public.vendas for select to authenticated using (eh_dono());
create policy venda_itens_dono on public.venda_itens for select to authenticated using (eh_dono());
create policy estoque_mov_dono on public.estoque_movimentos for select to authenticated using (eh_dono());
create policy auditoria_dono on public.auditoria for select to authenticated using (eh_dono());

-- Acesso pela API: só usuários logados. O que cada um vê é decidido pelas políticas acima.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------
-- Produtos para o PDV (sem custo). Combo mostra quantos dá pra montar.
-- ---------------------------------------------------------------------
create or replace function public.produtos_pdv()
returns table (id bigint, nome text, categoria text, codigo_barras text, codigo_interno text,
               preco numeric, disponivel integer, eh_combo boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform exigir_ativo();
  return query
  select p.id, p.nome, c.nome, p.codigo_barras, p.codigo_interno, p.preco,
         case when p.eh_combo then coalesce((
           select min(floor(pc.estoque::numeric / ci.quantidade))::int
           from combo_itens ci join produtos pc on pc.id = ci.produto_id
           where ci.combo_id = p.id), 0)
         else p.estoque end,
         p.eh_combo
  from produtos p join categorias c on c.id = p.categoria_id
  where p.ativo
  order by c.nome, p.nome;
end $$;

-- ---------------------------------------------------------------------
-- Caixa
-- ---------------------------------------------------------------------
create or replace function public.meu_caixa_aberto() returns bigint
language sql stable security definer set search_path = public as $$
  select id from caixas where operador_id = auth.uid() and fechado_em is null;
$$;

create or replace function public.abrir_caixa(p_valor_inicial numeric) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform exigir_ativo();
  if p_valor_inicial is null or p_valor_inicial < 0 then raise exception 'Informe um valor inicial válido.'; end if;
  if meu_caixa_aberto() is not null then raise exception 'Você já tem um caixa aberto.'; end if;
  insert into caixas (operador_id, valor_inicial) values (auth.uid(), p_valor_inicial) returning id into v_id;
  perform registrar_auditoria('abriu_caixa', jsonb_build_object('caixa', v_id, 'valor_inicial', p_valor_inicial));
  return v_id;
end $$;

create or replace function public.movimentar_caixa(p_tipo text, p_valor numeric, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_caixa bigint := meu_caixa_aberto();
begin
  perform exigir_ativo();
  if v_caixa is null then raise exception 'Abra o caixa primeiro.'; end if;
  if p_tipo not in ('sangria','reforco') then raise exception 'Tipo inválido.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
  insert into caixa_movimentos (caixa_id, tipo, valor, motivo, usuario_id) values (v_caixa, p_tipo, p_valor, p_motivo, auth.uid());
  perform registrar_auditoria(p_tipo, jsonb_build_object('caixa', v_caixa, 'valor', p_valor, 'motivo', p_motivo));
end $$;

-- Resumo de um caixa (dono vê qualquer um; operador só os próprios)
create or replace function public.resumo_caixa(p_caixa bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id bigint := coalesce(p_caixa, meu_caixa_aberto()); c caixas; r jsonb;
begin
  perform exigir_ativo();
  select * into c from caixas where id = v_id;
  if c.id is null then return null; end if;
  if c.operador_id <> auth.uid() and not eh_dono() then raise exception 'Acesso negado.'; end if;
  select jsonb_build_object(
    'id', c.id, 'operador', (select nome from perfis where id = c.operador_id),
    'aberto_em', c.aberto_em, 'fechado_em', c.fechado_em,
    'fechado_por', (select nome from perfis where id = c.fechado_por),
    'valor_inicial', c.valor_inicial,
    'dinheiro', coalesce(sum(v.total) filter (where v.forma_pagamento='dinheiro'),0),
    'pix', coalesce(sum(v.total) filter (where v.forma_pagamento='pix'),0),
    'credito', coalesce(sum(v.total) filter (where v.forma_pagamento='credito'),0),
    'debito', coalesce(sum(v.total) filter (where v.forma_pagamento='debito'),0),
    'qtd_vendas', count(v.id),
    'sangrias', (select coalesce(sum(valor),0) from caixa_movimentos where caixa_id=c.id and tipo='sangria'),
    'reforcos', (select coalesce(sum(valor),0) from caixa_movimentos where caixa_id=c.id and tipo='reforco'),
    'valor_contado', c.valor_contado)
  into r from vendas v where v.caixa_id = c.id;
  r := r || jsonb_build_object('valor_esperado',
        c.valor_inicial + (r->>'dinheiro')::numeric + (r->>'reforcos')::numeric - (r->>'sangrias')::numeric);
  if c.valor_contado is not null then
    r := r || jsonb_build_object('diferenca', c.valor_contado - (r->>'valor_esperado')::numeric);
  end if;
  return r;
end $$;

create or replace function public.fechar_caixa(p_valor_contado numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_caixa bigint := meu_caixa_aberto(); r jsonb;
begin
  perform exigir_ativo();
  if v_caixa is null then raise exception 'Você não tem caixa aberto.'; end if;
  if p_valor_contado is null or p_valor_contado < 0 then raise exception 'Informe o valor contado na gaveta.'; end if;
  r := resumo_caixa(v_caixa);
  update caixas set fechado_em = now(), fechado_por = auth.uid(),
         valor_esperado = (r->>'valor_esperado')::numeric, valor_contado = p_valor_contado
   where id = v_caixa;
  r := resumo_caixa(v_caixa);
  perform registrar_auditoria('fechou_caixa', r);
  return r;
end $$;

-- ---------------------------------------------------------------------
-- Venda (tudo numa transação: se um item falhar, nada é gravado)
-- p_itens = [{"produto_id": 1, "quantidade": 2}, ...]
-- ---------------------------------------------------------------------
create or replace function public.finalizar_venda(p_itens jsonb, p_forma text, p_valor_recebido numeric default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_caixa bigint := meu_caixa_aberto();
  v_venda bigint; v_total numeric := 0; v_custo numeric := 0; v_troco numeric := 0;
  it record; p produtos; comp record; v_qtd int; v_custo_unit numeric;
begin
  perform exigir_ativo();
  if v_caixa is null then raise exception 'Abra o caixa antes de vender.'; end if;
  if p_forma not in ('dinheiro','pix','credito','debito') then raise exception 'Forma de pagamento inválida.'; end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'O carrinho está vazio.'; end if;

  -- Junta itens repetidos
  create temp table _itens on commit drop as
    select (e->>'produto_id')::bigint produto_id, sum((e->>'quantidade')::int)::int quantidade
    from jsonb_array_elements(p_itens) e group by 1;
  if exists (select 1 from _itens where quantidade is null or quantidade <= 0) then
    raise exception 'Quantidade inválida no carrinho.';
  end if;

  -- Quanto cada produto físico vai sair do estoque (combos viram seus componentes)
  create temp table _baixa on commit drop as
    select coalesce(ci.produto_id, i.produto_id) produto_id,
           sum(i.quantidade * coalesce(ci.quantidade, 1))::int quantidade
    from _itens i join produtos pr on pr.id = i.produto_id
    left join combo_itens ci on ci.combo_id = pr.id and pr.eh_combo
    group by 1;

  if (select count(*) from _itens) <> (select count(*) from _itens i join produtos pr on pr.id = i.produto_id and pr.ativo) then
    raise exception 'Há produto inexistente ou inativo no carrinho.';
  end if;

  -- Trava as linhas (evita duas vendas simultâneas usarem o mesmo estoque) e confere
  for it in select b.*, pr.nome, pr.estoque from _baixa b join produtos pr on pr.id = b.produto_id
            order by b.produto_id for update of pr loop
    if it.estoque < it.quantidade then
      raise exception 'Estoque insuficiente de "%": disponível %, pedido %.', it.nome, it.estoque, it.quantidade;
    end if;
  end loop;

  for it in select * from _itens loop
    select * into p from produtos where id = it.produto_id;
    if p.eh_combo then
      select coalesce(sum(pc.custo * ci.quantidade),0) into v_custo_unit
      from combo_itens ci join produtos pc on pc.id = ci.produto_id where ci.combo_id = p.id;
    else v_custo_unit := p.custo; end if;
    v_total := v_total + p.preco * it.quantidade;
    v_custo := v_custo + v_custo_unit * it.quantidade;
  end loop;

  if p_forma = 'dinheiro' then
    if p_valor_recebido is not null then
      if p_valor_recebido < v_total then raise exception 'Valor recebido menor que o total.'; end if;
      v_troco := p_valor_recebido - v_total;
    end if;
  end if;

  insert into vendas (caixa_id, operador_id, total, custo_total, forma_pagamento, valor_recebido, troco)
  values (v_caixa, auth.uid(), v_total, v_custo, p_forma,
          case when p_forma='dinheiro' then p_valor_recebido end, v_troco)
  returning id into v_venda;

  for it in select * from _itens loop
    select * into p from produtos where id = it.produto_id;
    if p.eh_combo then
      select coalesce(sum(pc.custo * ci.quantidade),0) into v_custo_unit
      from combo_itens ci join produtos pc on pc.id = ci.produto_id where ci.combo_id = p.id;
    else v_custo_unit := p.custo; end if;
    insert into venda_itens (venda_id, produto_id, nome, quantidade, preco_unit, custo_unit)
    values (v_venda, p.id, p.nome, it.quantidade, p.preco, v_custo_unit);
  end loop;

  perform set_config('adega.mov_estoque', 'sim', true);
  for it in select * from _baixa loop
    update produtos set estoque = estoque - it.quantidade where id = it.produto_id returning estoque into v_qtd;
    insert into estoque_movimentos (produto_id, tipo, quantidade, estoque_depois, motivo, usuario_id, venda_id)
    values (it.produto_id, 'venda', -it.quantidade, v_qtd, 'Venda #' || v_venda, auth.uid(), v_venda);
  end loop;
  perform set_config('adega.mov_estoque', '', true);

  return jsonb_build_object('venda_id', v_venda, 'total', v_total, 'troco', v_troco);
end $$;

-- Vendas do próprio operador (sem custo/lucro)
create or replace function public.minhas_vendas(p_inicio timestamptz, p_fim timestamptz)
returns table (id bigint, criado_em timestamptz, total numeric, forma_pagamento text, itens jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  perform exigir_ativo();
  return query
  select v.id, v.criado_em, v.total, v.forma_pagamento,
         (select jsonb_agg(jsonb_build_object('nome', vi.nome, 'quantidade', vi.quantidade, 'preco', vi.preco_unit))
            from venda_itens vi where vi.venda_id = v.id)
  from vendas v
  where v.operador_id = auth.uid() and v.criado_em >= p_inicio and v.criado_em < p_fim
  order by v.criado_em desc;
end $$;

-- ---------------------------------------------------------------------
-- Estoque (dono): entrada, saída e ajuste
-- ---------------------------------------------------------------------
create or replace function public.movimentar_estoque(p_produto bigint, p_tipo text, p_quantidade int, p_motivo text)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_delta int; v_novo int; p produtos;
begin
  perform exigir_dono();
  select * into p from produtos where id = p_produto for update;
  if p.id is null then raise exception 'Produto não encontrado.'; end if;
  if p.eh_combo then raise exception 'Combo não tem estoque próprio. Movimente os produtos dele.'; end if;
  if p_quantidade is null or p_quantidade < 0 then raise exception 'Quantidade inválida.'; end if;
  v_delta := case p_tipo when 'entrada' then p_quantidade
                         when 'saida' then -p_quantidade
                         when 'ajuste' then p_quantidade - p.estoque   -- ajuste = contagem real
                         else null end;
  if v_delta is null then raise exception 'Tipo inválido.'; end if;
  if p.estoque + v_delta < 0 then raise exception 'O estoque não pode ficar negativo.'; end if;
  perform set_config('adega.mov_estoque', 'sim', true);
  update produtos set estoque = estoque + v_delta where id = p.id returning estoque into v_novo;
  perform set_config('adega.mov_estoque', '', true);
  insert into estoque_movimentos (produto_id, tipo, quantidade, estoque_depois, motivo, usuario_id)
  values (p.id, p_tipo, v_delta, v_novo, p_motivo, auth.uid());
  if p_tipo = 'ajuste' then
    perform registrar_auditoria('ajustou_estoque', jsonb_build_object('produto', p.nome, 'antes', p.estoque, 'depois', v_novo, 'motivo', p_motivo));
  end if;
  return v_novo;
end $$;

-- Exclusão: apaga se nunca foi vendido/movimentado; senão inativa (mantém o histórico)
create or replace function public.excluir_produto(p_produto bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  perform exigir_dono();
  select nome into v_nome from produtos where id = p_produto;
  if v_nome is null then raise exception 'Produto não encontrado.'; end if;
  if exists (select 1 from combo_itens where produto_id = p_produto) then
    raise exception 'Este produto faz parte de um combo. Remova-o do combo antes.';
  end if;
  if exists (select 1 from venda_itens where produto_id = p_produto)
     or exists (select 1 from estoque_movimentos where produto_id = p_produto and tipo <> 'cadastro') then
    update produtos set ativo = false where id = p_produto;
    perform registrar_auditoria('inativou_produto', jsonb_build_object('produto', v_nome));
    return 'inativado';
  end if;
  delete from estoque_movimentos where produto_id = p_produto;
  delete from produtos where id = p_produto;
  perform registrar_auditoria('excluiu_produto', jsonb_build_object('produto', v_nome));
  return 'excluido';
end $$;

-- ---------------------------------------------------------------------
-- Usuários (dono)
-- ---------------------------------------------------------------------
create or replace function public.configurar_usuario(p_id uuid, p_nome text, p_papel text, p_ativo boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_dono();
  if p_id = auth.uid() and (p_papel <> 'dono' or not p_ativo) then
    raise exception 'Você não pode tirar o seu próprio acesso de proprietário.';
  end if;
  if p_papel not in ('dono','operador') then raise exception 'Perfil inválido.'; end if;
  update perfis set nome = coalesce(nullif(trim(p_nome),''), nome), papel = p_papel, ativo = p_ativo where id = p_id;
  perform registrar_auditoria('alterou_usuario', jsonb_build_object('usuario', p_id, 'papel', p_papel, 'ativo', p_ativo));
end $$;

create or replace function public.redefinir_senha(p_id uuid, p_senha text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform exigir_dono();
  if length(coalesce(p_senha,'')) < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')), updated_at = now()
   where id = p_id;
  perform registrar_auditoria('redefiniu_senha', jsonb_build_object('usuario', p_id));
end $$;

-- ---------------------------------------------------------------------
-- Painel do dono
-- ---------------------------------------------------------------------
create or replace function public.painel(p_inicio timestamptz, p_fim timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; hoje_ini timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  perform exigir_dono();
  select jsonb_build_object(
    'faturamento', coalesce(sum(total),0),
    'custo', coalesce(sum(custo_total),0),
    'lucro_bruto', coalesce(sum(total - custo_total),0),
    'qtd_vendas', count(*),
    'ticket_medio', coalesce(round(avg(total),2),0),
    'por_forma', coalesce((select jsonb_object_agg(forma_pagamento, s) from
        (select forma_pagamento, sum(total) s from vendas where criado_em >= p_inicio and criado_em < p_fim group by 1) x), '{}'::jsonb)
  ) into r from vendas where criado_em >= p_inicio and criado_em < p_fim;

  r := r || jsonb_build_object(
    'hoje', (select jsonb_build_object('faturamento', coalesce(sum(total),0), 'lucro_bruto', coalesce(sum(total-custo_total),0), 'qtd_vendas', count(*))
             from vendas where criado_em >= hoje_ini),
    'mais_vendidos', coalesce((select jsonb_agg(x) from (
        select vi.nome, sum(vi.quantidade) quantidade, sum(vi.quantidade*vi.preco_unit) faturamento,
               sum(vi.quantidade*(vi.preco_unit-vi.custo_unit)) lucro
        from venda_itens vi join vendas v on v.id = vi.venda_id
        where v.criado_em >= p_inicio and v.criado_em < p_fim
        group by vi.nome order by 2 desc limit 8) x), '[]'::jsonb),
    'por_dia', coalesce((select jsonb_agg(x order by dia) from (
        select (criado_em at time zone 'America/Sao_Paulo')::date dia, sum(total) faturamento, sum(total-custo_total) lucro
        from vendas where criado_em >= p_inicio and criado_em < p_fim group by 1) x), '[]'::jsonb),
    'estoque_baixo', coalesce((select jsonb_agg(x) from (
        select nome, estoque, estoque_minimo from produtos
        where ativo and not eh_combo and estoque <= estoque_minimo order by estoque limit 20) x), '[]'::jsonb),
    'estoque_investido', (select coalesce(sum(custo*estoque),0) from produtos where ativo and not eh_combo),
    'estoque_valor_venda', (select coalesce(sum(preco*estoque),0) from produtos where ativo and not eh_combo)
  );
  return r;
end $$;

-- ---------------------------------------------------------------------
-- Quem pode chamar as funções
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.produtos_pdv(), public.meu_caixa_aberto(), public.abrir_caixa(numeric),
  public.movimentar_caixa(text,numeric,text), public.resumo_caixa(bigint), public.fechar_caixa(numeric),
  public.finalizar_venda(jsonb,text,numeric), public.minhas_vendas(timestamptz,timestamptz),
  public.movimentar_estoque(bigint,text,int,text), public.excluir_produto(bigint),
  public.configurar_usuario(uuid,text,text,boolean), public.redefinir_senha(uuid,text),
  public.painel(timestamptz,timestamptz), public.eh_dono(), public.usuario_ativo()
to authenticated;

-- ---------------------------------------------------------------------
-- Categorias iniciais
-- ---------------------------------------------------------------------
insert into public.categorias (nome) values
 ('Destilados'),('Vinhos'),('Cervejas'),('Conveniência'),('Refrigerantes'),
 ('Energéticos'),('Gelo'),('Tabacaria'),('Combos'),('Água');
