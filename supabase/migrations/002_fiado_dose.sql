-- =====================================================================
-- Adega 335 — Atualização 002: categoria Dose, Fiado cliente e Consumo do dono
-- Rode este arquivo inteiro UMA vez no SQL Editor (depois do 001).
-- =====================================================================

-- 1. Categoria Dose
insert into public.categorias (nome) values ('Dose') on conflict (nome) do nothing;

-- 2. Novas formas de pagamento e dados do fiado
alter table public.vendas drop constraint if exists vendas_forma_pagamento_check;
alter table public.vendas add constraint vendas_forma_pagamento_check
  check (forma_pagamento in ('dinheiro','pix','credito','debito','fiado_cliente','consumo_dono'));

alter table public.vendas
  add column if not exists cliente_nome text,
  add column if not exists observacao text,
  add column if not exists fiado_quitado_em timestamptz,
  add column if not exists fiado_quitado_por uuid references public.perfis(id),
  add column if not exists fiado_forma text check (fiado_forma in ('dinheiro','pix','credito','debito')),
  add column if not exists fiado_caixa_id bigint references public.caixas(id);
create index if not exists vendas_fiado_aberto on public.vendas (criado_em)
  where forma_pagamento = 'fiado_cliente' and fiado_quitado_em is null;

-- 3. Venda com fiado / consumo do dono
drop function if exists public.finalizar_venda(jsonb, text, numeric);

create or replace function public.finalizar_venda(
  p_itens jsonb, p_forma text, p_valor_recebido numeric default null,
  p_cliente text default null, p_observacao text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_caixa bigint := meu_caixa_aberto();
  v_venda bigint; v_total numeric := 0; v_custo numeric := 0; v_troco numeric := 0;
  it record; p produtos; v_qtd int; v_custo_unit numeric;
begin
  perform exigir_ativo();
  if v_caixa is null then raise exception 'Abra o caixa antes de vender.'; end if;
  if p_forma not in ('dinheiro','pix','credito','debito','fiado_cliente','consumo_dono') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  if p_forma = 'fiado_cliente' and coalesce(trim(p_cliente),'') = '' then
    raise exception 'Informe o nome do cliente do fiado.';
  end if;
  if p_forma in ('fiado_cliente','consumo_dono') and coalesce(trim(p_observacao),'') = '' then
    raise exception 'Descreva a operação (o que foi levado e por quê).';
  end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'O carrinho está vazio.'; end if;

  create temp table _itens on commit drop as
    select (e->>'produto_id')::bigint produto_id, sum((e->>'quantidade')::int)::int quantidade
    from jsonb_array_elements(p_itens) e group by 1;
  if exists (select 1 from _itens where quantidade is null or quantidade <= 0) then
    raise exception 'Quantidade inválida no carrinho.';
  end if;
  if (select count(*) from _itens) <> (select count(*) from _itens i join produtos pr on pr.id = i.produto_id and pr.ativo) then
    raise exception 'Há produto inexistente ou inativo no carrinho.';
  end if;

  create temp table _baixa on commit drop as
    select coalesce(ci.produto_id, i.produto_id) produto_id,
           sum(i.quantidade * coalesce(ci.quantidade, 1))::int quantidade
    from _itens i join produtos pr on pr.id = i.produto_id
    left join combo_itens ci on ci.combo_id = pr.id and pr.eh_combo
    group by 1;

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

  if p_forma = 'dinheiro' and p_valor_recebido is not null then
    if p_valor_recebido < v_total then raise exception 'Valor recebido menor que o total.'; end if;
    v_troco := p_valor_recebido - v_total;
  end if;

  insert into vendas (caixa_id, operador_id, total, custo_total, forma_pagamento, valor_recebido, troco, cliente_nome, observacao)
  values (v_caixa, auth.uid(), v_total, v_custo, p_forma,
          case when p_forma='dinheiro' then p_valor_recebido end, v_troco,
          nullif(trim(p_cliente),''), nullif(trim(p_observacao),''))
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
    values (it.produto_id, 'venda', -it.quantidade, v_qtd,
            case p_forma when 'consumo_dono' then 'Consumo do dono #' when 'fiado_cliente' then 'Fiado #' else 'Venda #' end || v_venda,
            auth.uid(), v_venda);
  end loop;
  perform set_config('adega.mov_estoque', '', true);

  if p_forma in ('fiado_cliente','consumo_dono') then
    perform registrar_auditoria(p_forma, jsonb_build_object('venda', v_venda, 'total', v_total,
      'cliente', p_cliente, 'observacao', p_observacao));
  end if;

  return jsonb_build_object('venda_id', v_venda, 'total', v_total, 'troco', v_troco);
end $$;

-- 4. Fiados em aberto (qualquer usuário ativo vê, para poder receber no balcão)
create or replace function public.fiados(p_abertos boolean default true)
returns table (id bigint, criado_em timestamptz, cliente_nome text, observacao text, total numeric,
               operador text, quitado_em timestamptz, quitado_por text, fiado_forma text, itens jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  perform exigir_ativo();
  return query
  select v.id, v.criado_em, v.cliente_nome, v.observacao, v.total,
         (select nome from perfis where perfis.id = v.operador_id),
         v.fiado_quitado_em, (select nome from perfis where perfis.id = v.fiado_quitado_por), v.fiado_forma,
         (select jsonb_agg(jsonb_build_object('nome', vi.nome, 'quantidade', vi.quantidade, 'preco', vi.preco_unit))
            from venda_itens vi where vi.venda_id = v.id)
  from vendas v
  where v.forma_pagamento = 'fiado_cliente'
    and (case when p_abertos then v.fiado_quitado_em is null else v.fiado_quitado_em is not null end)
  order by v.criado_em desc
  limit 300;
end $$;

-- Receber um fiado: o dinheiro entra no caixa aberto de quem recebe
create or replace function public.quitar_fiado(p_venda bigint, p_forma text) returns void
language plpgsql security definer set search_path = public as $$
declare v_caixa bigint := meu_caixa_aberto(); v vendas;
begin
  perform exigir_ativo();
  if v_caixa is null then raise exception 'Abra o caixa para receber o fiado.'; end if;
  if p_forma not in ('dinheiro','pix','credito','debito') then raise exception 'Forma de pagamento inválida.'; end if;
  select * into v from vendas where id = p_venda for update;
  if v.id is null or v.forma_pagamento <> 'fiado_cliente' then raise exception 'Fiado não encontrado.'; end if;
  if v.fiado_quitado_em is not null then raise exception 'Este fiado já foi pago.'; end if;
  update vendas set fiado_quitado_em = now(), fiado_quitado_por = auth.uid(), fiado_forma = p_forma, fiado_caixa_id = v_caixa
   where id = p_venda;
  perform registrar_auditoria('recebeu_fiado', jsonb_build_object('venda', p_venda, 'cliente', v.cliente_nome, 'valor', v.total, 'forma', p_forma));
end $$;

-- 5. Resumo do caixa com fiados e consumo do dono
create or replace function public.resumo_caixa(p_caixa bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id bigint := coalesce(p_caixa, meu_caixa_aberto()); c caixas; r jsonb; rec jsonb;
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
    'fiado_cliente', coalesce(sum(v.total) filter (where v.forma_pagamento='fiado_cliente'),0),
    'consumo_dono', coalesce(sum(v.total) filter (where v.forma_pagamento='consumo_dono'),0),
    'qtd_vendas', count(v.id),
    'sangrias', (select coalesce(sum(valor),0) from caixa_movimentos where caixa_id=c.id and tipo='sangria'),
    'reforcos', (select coalesce(sum(valor),0) from caixa_movimentos where caixa_id=c.id and tipo='reforco'),
    'valor_contado', c.valor_contado)
  into r from vendas v where v.caixa_id = c.id;

  select jsonb_build_object(
    'fiado_recebido_dinheiro', coalesce(sum(total) filter (where fiado_forma='dinheiro'),0),
    'fiado_recebido_outros', coalesce(sum(total) filter (where fiado_forma<>'dinheiro'),0))
  into rec from vendas where fiado_caixa_id = c.id;
  r := r || rec;

  r := r || jsonb_build_object('valor_esperado',
        c.valor_inicial + (r->>'dinheiro')::numeric + (r->>'fiado_recebido_dinheiro')::numeric
        + (r->>'reforcos')::numeric - (r->>'sangrias')::numeric);
  if c.valor_contado is not null then
    r := r || jsonb_build_object('diferenca', c.valor_contado - (r->>'valor_esperado')::numeric);
  end if;
  return r;
end $$;

-- 6. Painel: consumo do dono fora do faturamento; fiado a receber
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
        (select forma_pagamento, sum(total) s from vendas where criado_em >= p_inicio and criado_em < p_fim
           and forma_pagamento <> 'consumo_dono' group by 1) x), '{}'::jsonb)
  ) into r from vendas where criado_em >= p_inicio and criado_em < p_fim and forma_pagamento <> 'consumo_dono';

  r := r || jsonb_build_object(
    'hoje', (select jsonb_build_object('faturamento', coalesce(sum(total),0), 'lucro_bruto', coalesce(sum(total-custo_total),0), 'qtd_vendas', count(*))
             from vendas where criado_em >= hoje_ini and forma_pagamento <> 'consumo_dono'),
    'consumo_dono', (select jsonb_build_object('custo', coalesce(sum(custo_total),0), 'valor_venda', coalesce(sum(total),0), 'qtd', count(*))
             from vendas where criado_em >= p_inicio and criado_em < p_fim and forma_pagamento = 'consumo_dono'),
    'fiado_aberto', (select jsonb_build_object('total', coalesce(sum(total),0), 'qtd', count(*))
             from vendas where forma_pagamento = 'fiado_cliente' and fiado_quitado_em is null),
    'mais_vendidos', coalesce((select jsonb_agg(x) from (
        select vi.nome, sum(vi.quantidade) quantidade, sum(vi.quantidade*vi.preco_unit) faturamento,
               sum(vi.quantidade*(vi.preco_unit-vi.custo_unit)) lucro
        from venda_itens vi join vendas v on v.id = vi.venda_id
        where v.criado_em >= p_inicio and v.criado_em < p_fim and v.forma_pagamento <> 'consumo_dono'
        group by vi.nome order by 2 desc limit 8) x), '[]'::jsonb),
    'por_dia', coalesce((select jsonb_agg(x order by dia) from (
        select (criado_em at time zone 'America/Sao_Paulo')::date dia, sum(total) faturamento, sum(total-custo_total) lucro
        from vendas where criado_em >= p_inicio and criado_em < p_fim and forma_pagamento <> 'consumo_dono' group by 1) x), '[]'::jsonb),
    'estoque_baixo', coalesce((select jsonb_agg(x) from (
        select nome, estoque, estoque_minimo from produtos
        where ativo and not eh_combo and estoque <= estoque_minimo order by estoque limit 20) x), '[]'::jsonb),
    'estoque_investido', (select coalesce(sum(custo*estoque),0) from produtos where ativo and not eh_combo),
    'estoque_valor_venda', (select coalesce(sum(preco*estoque),0) from produtos where ativo and not eh_combo)
  );
  return r;
end $$;

-- 7. Permissões das funções novas/alteradas
revoke execute on function public.finalizar_venda(jsonb,text,numeric,text,text), public.fiados(boolean), public.quitar_fiado(bigint,text) from public, anon;
grant execute on function public.finalizar_venda(jsonb,text,numeric,text,text), public.fiados(boolean), public.quitar_fiado(bigint,text) to authenticated;
