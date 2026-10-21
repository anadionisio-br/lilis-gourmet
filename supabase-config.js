
/* Lilis Gourmet — conexão com Supabase */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://foqkgnlrafntdfewrsga.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_rqZK6atYPCGEVDZTamLZ8A_MdLCLMBd';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('A biblioteca do Supabase não foi carregada.');
    window.lilisSupabase = null;
    return;
  }

  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  function normalizeProduct(row) {
    const fillings = Array.isArray(row.fillings)
      ? row.fillings.map(String).filter(Boolean)
      : [];

    return {
      id: String(row.id),
      cat: String(row.category_id ?? row.cat ?? ''),
      name: row.name || '',
      desc: row.description ?? row.desc ?? '',
      prices: [
        Number(row.price_250 ?? 0),
        Number(row.price_350 ?? 0),
        Number(row.price_500 ?? 0)
      ],
      img: row.image_url || '',
      badge: row.badge || '',
      fillings,
      maxFillings: fillings.length ? Number(row.max_fillings) || 0 : 0
    };
  }

  async function loadCatalog() {
    const [categoriesResult, productsResult, extrasResult] =
      await Promise.all([
        client.from('categories').select('*')
          .order('sort_order').order('created_at'),
        client.from('products').select('*')
          .eq('active', true).order('created_at'),
        client.from('extras').select('*')
          .eq('active', true).order('name')
      ]);

    const error =
      categoriesResult.error ||
      productsResult.error ||
      extrasResult.error;

    if (error) {
      console.error('Erro ao carregar cardápio:', error);
      return { ok: false, error };
    }

    return {
      ok: true,
      categories: (categoriesResult.data || []).map(row => ({
        id: String(row.id),
        name: row.name,
        emoji: row.emoji || '🍿',
        note: row.note || ''
      })),
      products: (productsResult.data || []).map(normalizeProduct),
      extras: (extrasResult.data || []).map(row => ({
        id: String(row.id),
        name: row.name,
        price: Number(row.price) || 0
      }))
    };
  }

  async function createOrder(payload) {
    const { data, error } = await client.rpc(
      'create_lilis_order',
      { p_order: payload }
    );

    if (error) {
      console.error('Erro ao registrar pedido:', error);
      return { ok: false, error };
    }

    return { ok: true, data };
  }

  window.lilisSupabase = {
    client,
    loadCatalog,
    createOrder
  };
})();
