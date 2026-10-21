-- =====================================================================
-- LILIS GOURMET — banco de dados (Supabase / PostgreSQL)
--
-- COMO USAR:
--   1. Supabase > SQL Editor > New query
--   2. Cole TODO este arquivo e clique em Run.
--   3. Na seção "ADMINISTRADORA" (logo abaixo), troque o e-mail pelo da
--      conta que você criou em Authentication > Users.
--
-- Pode rodar de novo sem medo: o script não apaga dados existentes.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TABELAS
-- ---------------------------------------------------------------------

create table if not exists public.categories (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  emoji       text not null default '🍿',
  note        text not null default '',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.products (
  id            text primary key default gen_random_uuid()::text,
  category_id   text not null references public.categories(id) on delete restrict,
  name          text not null,
  description   text not null default '',
  price_250     numeric(10,2) not null check (price_250 > 0),
  price_350     numeric(10,2) not null check (price_350 > 0),
  price_500     numeric(10,2) not null check (price_500 > 0),
  image_url     text,
  badge         text not null default '',
  fillings      text[] not null default '{}',   -- recheios grátis (vazio = sem recheios)
  max_fillings  int  not null default 0 check (max_fillings >= 0),
  active        boolean not null default true,  -- false = oculto no site
  created_at    timestamptz not null default now()
);

create table if not exists public.extras (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  price       numeric(10,2) not null default 0 check (price >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    bigint generated always as identity,
  customer_name   text not null,
  customer_phone  text,
  delivery_mode   text not null check (delivery_mode in ('entrega','retirada')),
  address         text,
  payment_method  text,
  change_for      text,
  observations    text,
  subtotal        numeric(10,2) not null default 0,
  delivery_fee    numeric(10,2) not null default 0,
  total           numeric(10,2) not null default 0,
  status          text not null default 'Novo'
                  check (status in ('Novo','Preparando','Pronto','Entregue','Cancelado')),
  created_at      timestamptz not null default now()
);

create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  product_id    text,
  product_name  text not null,
  size          text,
  quantity      int  not null default 1 check (quantity > 0),
  unit_price    numeric(10,2) not null default 0,
  fillings      jsonb not null default '[]'::jsonb,
  extras        jsonb not null default '[]'::jsonb,
  note          text
);

-- Se você já tinha estas tabelas de antes, o "create table if not exists" acima
-- não adiciona colunas novas. Os comandos abaixo garantem que todas existam.
alter table public.categories add column if not exists emoji      text not null default '🍿';
alter table public.categories add column if not exists note       text not null default '';
alter table public.categories add column if not exists sort_order int  not null default 0;
alter table public.categories add column if not exists created_at timestamptz not null default now();

alter table public.products add column if not exists description  text not null default '';
alter table public.products add column if not exists price_250    numeric(10,2) not null default 1;
alter table public.products add column if not exists price_350    numeric(10,2) not null default 1;
alter table public.products add column if not exists price_500    numeric(10,2) not null default 1;
alter table public.products add column if not exists image_url    text;
alter table public.products add column if not exists badge        text not null default '';
alter table public.products add column if not exists fillings     text[] not null default '{}';
alter table public.products add column if not exists max_fillings int  not null default 0;
alter table public.products add column if not exists active       boolean not null default true;
alter table public.products add column if not exists created_at   timestamptz not null default now();

alter table public.extras add column if not exists active     boolean not null default true;
alter table public.extras add column if not exists created_at timestamptz not null default now();

create index if not exists products_category_idx on public.products(category_id);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists orders_created_idx    on public.orders(created_at desc);


-- ---------------------------------------------------------------------
-- 2. ADMINISTRADORA
--    Só e-mails listados aqui conseguem editar o cardápio e ver pedidos.
--    >>> TROQUE O E-MAIL ABAIXO PELO DA SUA CONTA DO SUPABASE <<<
-- ---------------------------------------------------------------------

create table if not exists public.admin_users (
  email text primary key
);

insert into public.admin_users (email)
values ('marcela.lilispipoca@gmail.com')
on conflict do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;


-- ---------------------------------------------------------------------
-- 3. SEGURANÇA (Row Level Security)
--    Visitantes: só leem o cardápio ativo.
--    Administradora: lê e edita tudo.
--    Pedidos: visitantes só criam pela função create_lilis_order().
-- ---------------------------------------------------------------------

alter table public.categories  enable row level security;
alter table public.products    enable row level security;
alter table public.extras      enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.admin_users enable row level security;

-- categorias
drop policy if exists "categorias: todos leem"   on public.categories;
drop policy if exists "categorias: admin edita"  on public.categories;
create policy "categorias: todos leem"  on public.categories for select using (true);
create policy "categorias: admin edita" on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

-- produtos
drop policy if exists "produtos: todos leem ativos" on public.products;
drop policy if exists "produtos: admin edita"       on public.products;
create policy "produtos: todos leem ativos" on public.products for select
  using (active or public.is_admin());
create policy "produtos: admin edita" on public.products for all
  using (public.is_admin()) with check (public.is_admin());

-- acréscimos
drop policy if exists "extras: todos leem ativos" on public.extras;
drop policy if exists "extras: admin edita"       on public.extras;
create policy "extras: todos leem ativos" on public.extras for select
  using (active or public.is_admin());
create policy "extras: admin edita" on public.extras for all
  using (public.is_admin()) with check (public.is_admin());

-- pedidos (só a administradora acessa direto)
drop policy if exists "pedidos: admin" on public.orders;
create policy "pedidos: admin" on public.orders for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "itens: admin" on public.order_items;
create policy "itens: admin" on public.order_items for all
  using (public.is_admin()) with check (public.is_admin());

-- lista de administradoras (ninguém pelo site; edite só pelo SQL Editor)
drop policy if exists "admin_users: admin lê" on public.admin_users;
create policy "admin_users: admin lê" on public.admin_users for select
  using (public.is_admin());


-- ---------------------------------------------------------------------
-- 4. FUNÇÃO QUE REGISTRA O PEDIDO DO CLIENTE
--    O preço é recalculado aqui no servidor a partir do cardápio, então
--    ninguém consegue mandar um pedido com valor adulterado.
-- ---------------------------------------------------------------------

create or replace function public.create_lilis_order(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery_fee constant numeric := 7;   -- mantenha igual a DELIVERY_FEE no index.html
  v_mode      text := coalesce(p_order->>'delivery_mode', 'entrega');
  v_order_id  uuid;
  v_number    bigint;
  v_item      jsonb;
  v_product   public.products%rowtype;
  v_qty       int;
  v_base      numeric;
  v_extra_sum numeric;
  v_extra_name text;
  v_extra_price numeric;
  v_subtotal  numeric := 0;
  v_fee       numeric;
begin
  if jsonb_typeof(p_order->'items') <> 'array'
     or jsonb_array_length(p_order->'items') = 0 then
    raise exception 'Pedido sem itens';
  end if;

  if length(trim(coalesce(p_order->>'customer_name', ''))) < 2 then
    raise exception 'Nome do cliente obrigatório';
  end if;

  if v_mode not in ('entrega','retirada') then
    v_mode := 'entrega';
  end if;
  v_fee := case when v_mode = 'entrega' then v_delivery_fee else 0 end;

  insert into public.orders (
    customer_name, customer_phone, delivery_mode, address,
    payment_method, change_for, observations, delivery_fee
  ) values (
    left(trim(p_order->>'customer_name'), 100),
    left(nullif(trim(coalesce(p_order->>'customer_phone','')), ''), 30),
    v_mode,
    left(nullif(trim(coalesce(p_order->>'address','')), ''), 250),
    left(nullif(trim(coalesce(p_order->>'payment_method','')), ''), 40),
    left(nullif(trim(coalesce(p_order->>'change_for','')), ''), 40),
    left(nullif(trim(coalesce(p_order->>'observations','')), ''), 500),
    v_fee
  )
  returning id, order_number into v_order_id, v_number;

  for v_item in select * from jsonb_array_elements(p_order->'items') loop
    select * into v_product
      from public.products
      where id = v_item->>'product_id' and active;

    if not found then
      raise exception 'Produto indisponível: %', coalesce(v_item->>'product_name', '?');
    end if;

    v_qty := greatest(1, least(30, coalesce((v_item->>'quantity')::int, 1)));

    v_base := case v_item->>'size'
      when '250 ml' then v_product.price_250
      when '350 ml' then v_product.price_350
      when '500 ml' then v_product.price_500
      else null
    end;
    if v_base is null then
      raise exception 'Tamanho inválido: %', v_item->>'size';
    end if;

    v_extra_sum := 0;
    if jsonb_typeof(v_item->'extras') = 'array' then
      for v_extra_name in select jsonb_array_elements_text(v_item->'extras') loop
        select price into v_extra_price
          from public.extras
          where name = v_extra_name and active
          limit 1;
        v_extra_sum := v_extra_sum + coalesce(v_extra_price, 0);
      end loop;
    end if;

    insert into public.order_items (
      order_id, product_id, product_name, size, quantity,
      unit_price, fillings, extras, note
    ) values (
      v_order_id, v_product.id, v_product.name, v_item->>'size', v_qty,
      v_base + v_extra_sum,
      case when jsonb_typeof(v_item->'fillings') = 'array'
           then v_item->'fillings' else '[]'::jsonb end,
      case when jsonb_typeof(v_item->'extras') = 'array'
           then v_item->'extras' else '[]'::jsonb end,
      left(nullif(trim(coalesce(v_item->>'note','')), ''), 250)
    );

    v_subtotal := v_subtotal + (v_base + v_extra_sum) * v_qty;
  end loop;

  update public.orders
     set subtotal = v_subtotal,
         total    = v_subtotal + v_fee
   where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_number,
    'total', v_subtotal + v_fee
  );
end;
$$;

revoke all on function public.create_lilis_order(jsonb) from public;
grant execute on function public.create_lilis_order(jsonb) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. FOTOS DOS PRODUTOS (Supabase Storage)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "fotos: todos veem"   on storage.objects;
drop policy if exists "fotos: admin envia"  on storage.objects;
drop policy if exists "fotos: admin troca"  on storage.objects;
drop policy if exists "fotos: admin apaga"  on storage.objects;

create policy "fotos: todos veem" on storage.objects for select
  using (bucket_id = 'product-images');
create policy "fotos: admin envia" on storage.objects for insert
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "fotos: admin troca" on storage.objects for update
  using (bucket_id = 'product-images' and public.is_admin());
create policy "fotos: admin apaga" on storage.objects for delete
  using (bucket_id = 'product-images' and public.is_admin());


-- ---------------------------------------------------------------------
-- 6. DADOS INICIAIS (o cardápio que já estava no site)
--    As imagens apontam para a pasta assets/ do site.
--    Depois de rodar, cada produto pode ser editado pelo painel admin.
-- ---------------------------------------------------------------------

insert into public.categories (id, name, emoji, note, sort_order) values
  ('baldinhos', 'Baldinhos tradicionais', '🍿',
   'Crocantes por fora, apaixonantes em cada mordida.', 1),
  ('chocolate', 'Chocolate', '🍫',
   'Um toque extra de felicidade para os chocólatras.', 2)
on conflict (id) do nothing;

insert into public.products
  (id, category_id, name, description, price_250, price_350, price_500,
   image_url, badge, fillings, max_fillings, created_at)
values
  ('trad', 'baldinhos', 'Baldinho Tradicional',
   'Pipoca caramelizada crocante, com até 2 recheios sem custo.',
   18, 22, 25, 'assets/trad.webp', 'Queridinha 💗',
   array['Ninho','Avelã','Kinder Bueno'], 2, now() - interval '4 minutes'),
  ('nutella', 'chocolate', 'Só Nutella',
   'Pipoca coberta com Nutella.',
   25, 27, 30, 'assets/nutella.webp', 'Chocolate lover',
   '{}', 0, now() - interval '3 minutes'),
  ('galak', 'chocolate', 'Só Galak',
   'Pipoca coberta com chocolate branco Galak.',
   25, 27, 30, 'assets/galak.webp', '',
   '{}', 0, now() - interval '2 minutes'),
  ('duo', 'chocolate', 'Nutella e Galak',
   'Os dois queridinhos juntos no mesmo baldinho.',
   30, 30, 30, 'assets/duo.webp', 'R$ 30 em qualquer tamanho',
   '{}', 0, now() - interval '1 minute')
on conflict (id) do nothing;

insert into public.extras (id, name, price) values
  ('nutella', 'Nutella', 5),
  ('galak',   'Galak',   6),
  ('bombom',  'Bombom',  3)
on conflict (id) do nothing;
