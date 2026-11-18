-- Testes das regras no banco. Rode em um Postgres de teste, depois de 00_simular_supabase.sql e da migration.
-- As linhas marcadas "falha" DEVEM dar erro.
\set ON_ERROR_STOP 0
insert into auth.users(id,email,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000001','dono@x','{"nome":"Dono","usuario":"dono"}'),
('00000000-0000-0000-0000-000000000002','op@x','{"nome":"Op","usuario":"op"}');
select usuario,papel,ativo from perfis order by usuario;
set role authenticated;
-- operador inativo
set test.uid='00000000-0000-0000-0000-000000000002';
select abrir_caixa(100);  -- deve falhar
-- dono
set test.uid='00000000-0000-0000-0000-000000000001';
select configurar_usuario('00000000-0000-0000-0000-000000000002','Op','operador',true);
select configurar_usuario('00000000-0000-0000-0000-000000000001','Dono','operador',true); -- falha
insert into produtos(nome,categoria_id,custo,preco,estoque,codigo_barras) values
('Vodka',1,30,50,2,'111'),('Red Bull',6,8,15,10,'222'),('Gelo coco',7,2,5,10,'333');
insert into produtos(nome,categoria_id,custo,preco,eh_combo) values ('Combo Vodka',9,0,99,true);
insert into combo_itens select (select id from produtos where nome='Combo Vodka'), id, q from (values ('Vodka',1),('Red Bull',4),('Gelo coco',4)) v(n,q) join produtos on nome=n;
update produtos set estoque=99 where nome='Vodka'; -- falha (silencioso)
update produtos set preco=55 where nome='Vodka';  -- ok + auditoria
select movimentar_estoque((select id from produtos where nome='Vodka'),'entrada',1,'compra');
-- operador
set test.uid='00000000-0000-0000-0000-000000000002';
select count(*) from produtos; -- 0 (RLS)
select nome,preco,disponivel from produtos_pdv();
select painel(now()-interval '1 day', now()+interval '1 day'); -- falha
select abrir_caixa(100);
select finalizar_venda(jsonb_build_array(jsonb_build_object('produto_id',(select id from produtos_pdv() where nome='Combo Vodka'),'quantidade',2)),'pix');
select finalizar_venda(jsonb_build_array(jsonb_build_object('produto_id',(select id from produtos_pdv() where nome='Combo Vodka'),'quantidade',3)),'pix'); -- falha estoque
select finalizar_venda(jsonb_build_array(jsonb_build_object('produto_id',(select id from produtos_pdv() where nome='Gelo coco'),'quantidade',1),jsonb_build_object('produto_id',(select id from produtos_pdv() where nome='Gelo coco'),'quantidade',1)),'dinheiro',20);
select nome,disponivel from produtos_pdv();
select movimentar_caixa('sangria',10,'troco');
select id,total,forma_pagamento from minhas_vendas(now()-interval '1 day', now()+interval '1 day');
select fechar_caixa(100);
select count(*) from vendas; -- 0 RLS
set test.uid='00000000-0000-0000-0000-000000000001';
select painel(now()-interval '1 day', now()+interval '1 day');
select excluir_produto((select id from produtos where nome='Vodka')); -- falha (combo)
select tipo,quantidade,estoque_depois from estoque_movimentos order by id;
select acao from auditoria order by id;
reset role;
set role anon; select * from perfis; select produtos_pdv();
