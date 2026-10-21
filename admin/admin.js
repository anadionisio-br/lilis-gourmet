(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);

  const client = window.lilisSupabase?.client;
  const BUCKET = 'product-images';
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  const money = value =>
    Number(value || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

  const escapeHtml = value =>
    String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);

  let categories = [];
  let products = [];
  let extras = [];
  let orders = [];
  let currentFilter = 'Todos';
  let editingProductId = null;
  let editingImageUrl = null;
  let newImageFile = null;
  let editImageFile = null;
  let toastTimer;

  function toast(message) {
    const node = $('#toast');
    if (!node) {
      alert(message);
      return;
    }

    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 3500);
  }

  function requireClient() {
    if (!client) {
      toast('Supabase não carregado. Confira a ordem dos scripts.');
      return false;
    }
    return true;
  }

  /* ---------- Login ---------- */

  function askLogin(message) {
    const dialog = $('#loginDialog');
    const form = $('#loginForm');
    const errorNode = $('#loginError');

    errorNode.hidden = !message;
    errorNode.textContent = message || '';

    // Sem login não há painel: Esc não fecha a janela.
    dialog.oncancel = event => event.preventDefault();

    return new Promise(resolve => {
      form.onsubmit = async event => {
        event.preventDefault();
        $('#loginSubmit').disabled = true;

        const { error } = await client.auth.signInWithPassword({
          email: $('#loginEmail').value.trim(),
          password: $('#loginPassword').value
        });

        $('#loginSubmit').disabled = false;

        if (error) {
          errorNode.hidden = false;
          errorNode.textContent = 'E-mail ou senha incorretos.';
          return;
        }

        $('#loginPassword').value = '';
        dialog.close();
        resolve();
      };

      if (!dialog.open) dialog.showModal();
    });
  }

  async function ensureAdminSession() {
    let message = '';

    for (;;) {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;

      if (!data.session) {
        await askLogin(message);
        message = '';
      }

      const check = await client.rpc('is_admin');
      if (check.error) throw check.error;
      if (check.data === true) return true;

      await client.auth.signOut();
      message = 'Essa conta ainda não é administradora. Coloque o e-mail dela na tabela admin_users (veja supabase/schema.sql).';
    }
  }

  /* ---------- Utilitários ---------- */

  async function runQuery(query, successMessage) {
    const { data, error } = await query;

    if (error) {
      console.error(error);
      toast('Erro no Supabase: ' + error.message);
      throw error;
    }

    if (successMessage) toast(successMessage);
    return data;
  }

  // Update que o Supabase "aceita" mas não altera nada (permissão/RLS) vira erro visível.
  async function runUpdate(query, successMessage) {
    const { data, error } = await query.select();

    if (error) {
      console.error(error);
      toast('Erro no Supabase: ' + error.message);
      throw error;
    }

    if (!data || data.length === 0) {
      const message = 'Nada foi alterado: esta conta não tem permissão de administradora ou o produto não existe mais. Confira a tabela admin_users no Supabase.';
      toast(message);
      throw new Error(message);
    }

    if (successMessage) toast(successMessage);
    return data;
  }

  // Imagens padrão ficam em assets/ (relativo à raiz do site); as enviadas são URLs completas.
  function imageSrc(url) {
    if (!url) return '';
    return /^(https?:|data:|blob:|\/)/.test(url) ? url : '../' + url;
  }

  function parseFillings(text) {
    const seen = new Set();
    return String(text || '')
      .split(',')
      .map(item => item.trim())
      .filter(item => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()));
  }

  function checkImageFile(file) {
    if (!file.type.startsWith('image/')) return 'Escolha um arquivo de imagem.';
    if (file.size > MAX_IMAGE_BYTES) return 'A imagem deve ter até 5 MB.';
    return '';
  }

  async function uploadProductImage(file) {
    const ext = (file.name.split('.').pop() || file.type.split('/')[1] || 'jpg')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await client.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      cacheControl: '31536000'
    });
    if (error) throw error;

    return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  /* ---------- Renderização ---------- */

  function renderStats() {
    $('#statOrders').textContent = orders.length;
    $('#statNew').textContent =
      orders.filter(order => order.status === 'Novo').length;
    $('#statFlavors').textContent = products.length;
  }

  function categoryOptionsHtml() {
    return categories.map(category =>
      `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`
    ).join('');
  }

  function renderCategoryOptions() {
    const select = $('#flavorCategory');
    const previous = select.value;

    select.innerHTML = categoryOptionsHtml();

    if (categories.some(category => String(category.id) === previous)) {
      select.value = previous;
    }

    $('#editCategory').innerHTML = categoryOptionsHtml();

    $('#categoriesList').innerHTML = categories.map(category => `
      <article class="flavor-row">
        <div><h3>${escapeHtml(category.emoji || '📁')} ${escapeHtml(category.name)}</h3></div>
        <button class="remove" type="button"
          data-remove-category="${escapeHtml(category.id)}">Excluir</button>
      </article>
    `).join('');
  }

  function productRowHtml(product) {
    const thumb = product.image_url
      ? `<img src="${escapeHtml(imageSrc(product.image_url))}" alt="" class="product-thumb">`
      : '<div class="product-thumb empty-thumb">🍿</div>';

    const fillings = Array.isArray(product.fillings) && product.fillings.length
      ? `<br>Recheios (até ${product.max_fillings}): ${escapeHtml(product.fillings.join(', '))}`
      : '';

    return `
      <article class="flavor-row${product.active ? '' : ' is-hidden'}">
        <div class="product-row-main">
          ${thumb}
          <div>
            <h3>${escapeHtml(product.name)}
              ${product.badge ? `<span class="pill">${escapeHtml(product.badge)}</span>` : ''}
              ${product.active ? '' : '<span class="pill off">Oculto no site</span>'}
            </h3>
            <p class="muted">
              ${escapeHtml(product.description || '')}<br>
              250 ml: ${money(product.price_250)}
              · 350 ml: ${money(product.price_350)}
              · 500 ml: ${money(product.price_500)}${fillings}
            </p>
          </div>
        </div>
        <div class="extra-actions">
          <button class="btn light" type="button"
            data-edit-product="${escapeHtml(product.id)}">Editar</button>
          <button class="btn light" type="button"
            data-toggle-product="${escapeHtml(product.id)}">${product.active ? 'Ocultar' : 'Mostrar'}</button>
          <button class="remove" type="button"
            data-remove="${escapeHtml(product.id)}">Excluir</button>
        </div>
      </article>
    `;
  }

  function renderFlavors() {
    renderStats();

    if (!products.length) {
      $('#flavors').innerHTML =
        '<div class="empty">Nenhum produto cadastrado. Rode o supabase/schema.sql ou adicione um sabor acima.</div>';
      return;
    }

    const known = new Set(categories.map(category => String(category.id)));
    const groups = categories.map(category => ({
      title: `${category.emoji || ''} ${category.name}`.trim(),
      items: products.filter(product => String(product.category_id) === String(category.id))
    }));

    const orphans = products.filter(product => !known.has(String(product.category_id)));
    if (orphans.length) groups.push({ title: 'Sem categoria', items: orphans });

    $('#flavors').innerHTML = groups
      .filter(group => group.items.length)
      .map(group => `
        <h4 class="group-title">${escapeHtml(group.title)}</h4>
        ${group.items.map(productRowHtml).join('')}
      `).join('');
  }

  function renderExtras() {
    if (!extras.length) {
      $('#extrasList').innerHTML =
        '<div class="empty">Nenhum acréscimo cadastrado. Adicione um acima. 🍫</div>';
      return;
    }

    $('#extrasList').innerHTML = extras.map(extra => `
      <article class="flavor-row">
        <div>
          <h3>🍫 ${escapeHtml(extra.name)}</h3>
          <p class="muted">Acréscimo: <strong>${money(extra.price)}</strong></p>
        </div>
        <div class="extra-actions">
          <button class="btn light" type="button"
            data-edit-extra="${escapeHtml(extra.id)}">Editar</button>
          <button class="remove" type="button"
            data-remove-extra="${escapeHtml(extra.id)}">Excluir</button>
        </div>
      </article>
    `).join('');
  }

  function renderOrders() {
    const filtered = currentFilter === 'Todos'
      ? orders
      : orders.filter(order => order.status === currentFilter);

    if (!filtered.length) {
      $('#orders').innerHTML =
        '<div class="empty">Ainda não há pedidos nesta lista. 🍿</div>';
      renderStats();
      return;
    }

    $('#orders').innerHTML = filtered.map(order => {
      const date = order.created_at
        ? new Date(order.created_at).toLocaleString('pt-BR')
        : 'Data não informada';

      const items = (order.items || []).map(item => {
        const qty = Number(item.quantity) || 1;
        const fillings = Array.isArray(item.fillings) ? item.fillings : [];
        const itemExtras = Array.isArray(item.extras) ? item.extras : [];

        return `
          <li>
            ${qty}x ${escapeHtml(item.product_name)}
            (${escapeHtml(item.size || '')})
            — ${money(Number(item.unit_price) * qty)}
            ${fillings.length
              ? `<br><small>Recheios: ${escapeHtml(fillings.join(', '))}</small>`
              : ''}
            ${itemExtras.length
              ? `<br><small>Adicionais: ${escapeHtml(itemExtras.map(extra =>
                  typeof extra === 'string' ? extra : extra.name || ''
                ).join(', '))}</small>`
              : ''}
          </li>
        `;
      }).join('');

      return `
        <article class="order">
          <div class="order-top">
            <div>
              <h3>Pedido ${escapeHtml(order.order_number ?? order.id)}
                · ${escapeHtml(order.customer_name || 'Cliente')}</h3>
              <div class="muted">
                ${escapeHtml(date)}<br>
                ${escapeHtml(order.delivery_mode === 'entrega'
                  ? order.address || 'Endereço não informado'
                  : 'Retirada no local')}<br>
                Telefone: ${escapeHtml(order.customer_phone || 'Não informado')}<br>
                Pagamento: ${escapeHtml(order.payment_method || 'Não informado')}
              </div>
            </div>
            <span class="pill">${escapeHtml(order.status || 'Novo')}</span>
          </div>

          <ul class="order-items">${items || '<li>Itens não informados</li>'}</ul>

          ${order.observations
            ? `<p class="muted">Observação: ${escapeHtml(order.observations)}</p>`
            : ''}

          <div class="order-bottom">
            <strong>${money(order.total)}</strong>
            <label>
              Atualizar status
              <select class="status" data-order="${escapeHtml(order.id)}">
                ${['Novo', 'Preparando', 'Pronto', 'Entregue', 'Cancelado']
                  .map(status => `<option ${order.status === status ? 'selected' : ''}>${status}</option>`)
                  .join('')}
              </select>
            </label>
          </div>
        </article>
      `;
    }).join('');

    renderStats();
  }

  async function loadAll() {
    const results = await Promise.all([
      client.from('categories').select('*').order('sort_order').order('created_at'),
      client.from('products').select('*').order('created_at'),
      client.from('extras').select('*').order('name'),
      client.from('orders').select('*').order('created_at', { ascending: false })
    ]);

    for (const result of results) {
      if (result.error) throw result.error;
    }

    categories = results[0].data || [];
    products = results[1].data || [];
    extras = results[2].data || [];
    orders = results[3].data || [];

    if (orders.length) {
      const ids = orders.map(order => order.id);
      const { data: orderItems, error } = await client
        .from('order_items')
        .select('*')
        .in('order_id', ids);

      if (error) throw error;

      const items = orderItems || [];
      orders = orders.map(order => ({
        ...order,
        items: items.filter(item => String(item.order_id) === String(order.id))
      }));
    }

    renderCategoryOptions();
    renderFlavors();
    renderExtras();
    renderOrders();
  }

  /* ---------- Adicionar produto ---------- */

  function resetAddForm() {
    $('#flavorForm').reset();
    newImageFile = null;
    $('#imagePreview').hidden = true;
    $('#imagePreview').removeAttribute('src');
  }

  function readProductFields(prefix) {
    const id = suffix => $(`#${prefix}${suffix}`);
    const fillings = parseFillings(id('Fillings').value);
    const maxFillings = Math.max(0, Math.floor(Number(id('MaxFillings').value) || 0));

    return {
      name: id('Name').value.trim(),
      description: (prefix === 'flavor' ? $('#flavorDesc') : $('#editDesc')).value.trim(),
      category_id: (prefix === 'flavor' ? $('#flavorCategory') : $('#editCategory')).value,
      prices: ['250', '350', '500'].map(size =>
        Number((prefix === 'flavor' ? $('#price' + size) : $('#editPrice' + size)).value)),
      badge: id('Badge').value.trim(),
      fillings,
      max_fillings: fillings.length ? maxFillings : 0
    };
  }

  function validateProduct(fields) {
    if (!fields.name || !fields.description || !fields.category_id ||
        fields.prices.some(price => !Number.isFinite(price) || price <= 0)) {
      return 'Preencha nome, descrição, categoria e os três preços.';
    }
    if (fields.fillings.length && fields.max_fillings < 1) {
      return 'Informe quantos recheios o cliente pode escolher.';
    }
    return '';
  }

  function toPayload(fields) {
    return {
      name: fields.name,
      description: fields.description,
      category_id: fields.category_id,
      price_250: fields.prices[0],
      price_350: fields.prices[1],
      price_500: fields.prices[2],
      badge: fields.badge,
      fillings: fields.fillings,
      max_fillings: fields.max_fillings
    };
  }

  /* ---------- Editar produto (janela individual) ---------- */

  function openEditProduct(id) {
    const product = products.find(item => String(item.id) === String(id));
    if (!product) return;

    editingProductId = product.id;
    editingImageUrl = product.image_url || null;
    editImageFile = null;

    $('#editTitle').textContent = `Editar: ${product.name}`;
    $('#editName').value = product.name;
    $('#editDesc').value = product.description || '';
    $('#editCategory').value = product.category_id;
    $('#editPrice250').value = product.price_250;
    $('#editPrice350').value = product.price_350;
    $('#editPrice500').value = product.price_500;
    $('#editBadge').value = product.badge || '';
    $('#editFillings').value = (product.fillings || []).join(', ');
    $('#editMaxFillings').value = product.max_fillings || 0;
    $('#editActive').checked = !!product.active;
    $('#editImg').value = '';

    if (product.image_url) {
      $('#editPreview').src = imageSrc(product.image_url);
      $('#editPreview').hidden = false;
    } else {
      $('#editPreview').hidden = true;
      $('#editPreview').removeAttribute('src');
    }

    $('#editDialog').showModal();
  }

  function closeEditProduct() {
    $('#editDialog').close();
    editingProductId = null;
    editingImageUrl = null;
    editImageFile = null;
  }

  if (!requireClient()) return;

  $('#flavorImg').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file) return;

    const problem = checkImageFile(file);
    if (problem) {
      toast(problem);
      event.target.value = '';
      return;
    }

    newImageFile = file;
    $('#imagePreview').src = URL.createObjectURL(file);
    $('#imagePreview').hidden = false;
  });

  $('#editImg').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file) return;

    const problem = checkImageFile(file);
    if (problem) {
      toast(problem);
      event.target.value = '';
      return;
    }

    editImageFile = file;
    $('#editPreview').src = URL.createObjectURL(file);
    $('#editPreview').hidden = false;
  });

  $('#flavorForm').addEventListener('submit', async event => {
    event.preventDefault();

    const fields = readProductFields('flavor');
    const problem = validateProduct(fields);
    if (problem) {
      toast(problem);
      return;
    }

    const button = $('#saveProductButton');
    button.disabled = true;

    try {
      const imageUrl = newImageFile ? await uploadProductImage(newImageFile) : null;

      await runQuery(
        client.from('products').insert({
          ...toPayload(fields),
          image_url: imageUrl,
          active: true
        }),
        'Sabor adicionado ao cardápio!'
      );

      resetAddForm();
      await loadAll();
    } catch (error) {
      console.error(error);
      if (!error?.statusCode && error?.message) toast('Erro: ' + error.message);
    } finally {
      button.disabled = false;
    }
  });

  $('#editForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!editingProductId) return;

    const fields = readProductFields('edit');
    const problem = validateProduct(fields);
    if (problem) {
      toast(problem);
      return;
    }

    const button = $('#editSave');
    button.disabled = true;

    try {
      const imageUrl = editImageFile
        ? await uploadProductImage(editImageFile)
        : editingImageUrl;

      await runUpdate(
        client.from('products')
          .update({
            ...toPayload(fields),
            image_url: imageUrl,
            active: $('#editActive').checked
          })
          .eq('id', editingProductId),
        'Produto atualizado!'
      );

      closeEditProduct();
      await loadAll();
    } catch (error) {
      console.error(error);
      if (!error?.statusCode && error?.message) toast('Erro: ' + error.message);
    } finally {
      button.disabled = false;
    }
  });

  $('#editClose').addEventListener('click', closeEditProduct);
  $('#editCancel').addEventListener('click', closeEditProduct);

  $('#flavors').addEventListener('click', async event => {
    const editButton = event.target.closest('[data-edit-product]');
    if (editButton) {
      openEditProduct(editButton.dataset.editProduct);
      return;
    }

    const toggleButton = event.target.closest('[data-toggle-product]');
    if (toggleButton) {
      const product = products.find(item =>
        String(item.id) === String(toggleButton.dataset.toggleProduct));
      if (!product) return;

      try {
        await runUpdate(
          client.from('products')
            .update({ active: !product.active })
            .eq('id', product.id),
          product.active ? 'Produto oculto do site.' : 'Produto visível no site.'
        );
        await loadAll();
      } catch (error) {
        console.error(error);
      }
      return;
    }

    const removeButton = event.target.closest('[data-remove]');
    if (!removeButton) return;

    if (!confirm('Deseja realmente excluir este sabor? Para apenas tirar do site, use "Ocultar".')) return;

    try {
      await runQuery(
        client.from('products').delete().eq('id', removeButton.dataset.remove),
        'Produto excluído.'
      );
      await loadAll();
    } catch (error) {
      console.error(error);
    }
  });

  /* ---------- Categorias ---------- */

  $('#categoryForm').addEventListener('submit', async event => {
    event.preventDefault();

    const name = $('#categoryName').value.trim();
    if (!name) return;

    if (categories.some(category =>
      category.name.toLowerCase() === name.toLowerCase()
    )) {
      toast('Essa categoria já existe.');
      return;
    }

    const nextOrder = categories.reduce(
      (max, category) => Math.max(max, Number(category.sort_order) || 0), 0
    ) + 1;

    try {
      await runQuery(
        client.from('categories').insert({ name, sort_order: nextOrder }),
        'Categoria criada!'
      );
      $('#categoryName').value = '';
      await loadAll();
    } catch (error) {
      console.error(error);
    }
  });

  $('#categoriesList').addEventListener('click', async event => {
    const button = event.target.closest('[data-remove-category]');
    if (!button) return;

    const id = button.dataset.removeCategory;

    if (products.some(product => String(product.category_id) === String(id))) {
      toast('Mova ou exclua os produtos desta categoria antes de removê-la.');
      return;
    }

    if (!confirm('Deseja excluir esta categoria?')) return;

    try {
      await runQuery(
        client.from('categories').delete().eq('id', id),
        'Categoria excluída.'
      );
      await loadAll();
    } catch (error) {
      console.error(error);
    }
  });

  /* ---------- Acréscimos, pedidos e filtros ---------- */

  $('#extraForm').addEventListener('submit', async event => {
    event.preventDefault();

    const name = $('#extraName').value.trim();
    const price = Number($('#extraPrice').value);

    if (!name || !Number.isFinite(price) || price < 0) {
      toast('Informe o nome e um preço válido.');
      return;
    }

    try {
      await runQuery(
        client.from('extras').insert({ name, price, active: true }),
        'Acréscimo adicionado!'
      );
      event.target.reset();
      await loadAll();
    } catch (error) {
      console.error(error);
    }
  });

  $('#extrasList').addEventListener('click', async event => {
    const removeButton = event.target.closest('[data-remove-extra]');
    const editButton = event.target.closest('[data-edit-extra]');

    if (removeButton) {
      if (!confirm('Deseja excluir este acréscimo?')) return;

      try {
        await runQuery(
          client.from('extras').delete().eq('id', removeButton.dataset.removeExtra),
          'Acréscimo excluído.'
        );
        await loadAll();
      } catch (error) {
        console.error(error);
      }
      return;
    }

    if (editButton) {
      const extra = extras.find(item =>
        String(item.id) === String(editButton.dataset.editExtra)
      );
      if (!extra) return;

      const name = prompt('Nome do acréscimo:', extra.name);
      if (name === null) return;

      const priceText = prompt(
        'Preço adicional em reais:',
        String(extra.price).replace('.', ',')
      );
      if (priceText === null) return;

      const price = Number(priceText.replace(',', '.'));
      if (!name.trim() || !Number.isFinite(price) || price < 0) {
        toast('Nome ou preço inválido.');
        return;
      }

      try {
        await runQuery(
          client.from('extras')
            .update({ name: name.trim(), price })
            .eq('id', extra.id),
          'Acréscimo atualizado.'
        );
        await loadAll();
      } catch (error) {
        console.error(error);
      }
    }
  });

  $('#orders').addEventListener('change', async event => {
    const select = event.target.closest('[data-order]');
    if (!select) return;

    try {
      await runQuery(
        client.from('orders')
          .update({ status: select.value })
          .eq('id', select.dataset.order),
        'Status do pedido atualizado.'
      );
      await loadAll();
    } catch (error) {
      console.error(error);
    }
  });

  document.querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', () => {
      currentFilter = button.dataset.filter;

      document.querySelectorAll('[data-filter]').forEach(item => {
        item.classList.toggle('active', item === button);
      });

      renderOrders();
    });
  });

  $('#refreshOrders').addEventListener('click', async () => {
    try {
      await loadAll();
      toast('Painel atualizado.');
    } catch (error) {
      console.error(error);
      toast('Não foi possível atualizar: ' + error.message);
    }
  });

  $('#logoutButton').addEventListener('click', async () => {
    await client.auth.signOut();
    location.reload();
  });

  (async () => {
    try {
      await ensureAdminSession();
      await loadAll();
    } catch (error) {
      console.error('Erro ao iniciar painel:', error);
      toast('Erro ao iniciar o painel: ' + (error.message || error));
    }
  })();
})();
