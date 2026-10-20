(() => {
  'use strict';
  const PRODUCT_KEY = 'lilis-products-v1';
  const ORDER_KEY = 'lilis-orders-v1';
  const EXTRA_KEY = 'lilis-extras-v1';
  const CATEGORY_KEY = 'lilis-categories-v1';
  const DEFAULT_CATEGORIES = [{id:'baldinhos',name:'Baldinhos tradicionais'},{id:'chocolate',name:'Chocolate'}];
  const DEFAULT_EXTRAS = [
    {id: 'nutella', name: 'Nutella', price: 5},
    {id: 'galak', name: 'Galak', price: 6},
    {id: 'bombom', name: 'Bombom', price: 3}
  ];
  const $ = s => document.querySelector(s);
  let currentFilter = 'Todos';
  const money = value => Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read = key => { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch(e) { return []; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  let customProducts = read(PRODUCT_KEY);
  let orders = read(ORDER_KEY);
  let extras = read(EXTRA_KEY);
  let categories = localStorage.getItem(CATEGORY_KEY) ? read(CATEGORY_KEY) : DEFAULT_CATEGORIES.map(item => ({...item}));
  let editingProductId = null;
  let selectedImageData = '';
  const imageInput = $('#flavorImg');
  function categoryId(name) { return 'cat-' + name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') + '-' + Date.now().toString(36); }
  function renderCategoryOptions() {
    const select = $('#flavorCategory'); const previous = select.value;
    select.innerHTML = categories.map(cat => `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</option>`).join('');
    if (categories.some(cat => cat.id === previous)) select.value = previous;
    $('#categoriesList').innerHTML = categories.map(cat => `<article class="flavor-row"><div><h3>📁 ${escapeHtml(cat.name)}</h3></div><button class="remove" type="button" data-remove-category="${escapeHtml(cat.id)}">Excluir</button></article>`).join('');
  }
  function resetProductForm() { $('#flavorForm').reset(); editingProductId = null; selectedImageData = ''; imageInput.value = ''; $('#imagePreview').hidden = true; $('#imagePreview').removeAttribute('src'); $('#saveProductButton').textContent = '＋ Adicionar sabor ao cardápio'; $('#cancelEditProduct').hidden = true; $('#flavorForm').classList.remove('editing'); }
  function editProduct(id) { const p = customProducts.find(item => item.id === id); if (!p) return; editingProductId = id; $('#flavorName').value=p.name; $('#flavorDesc').value=p.desc; $('#flavorCategory').value=p.cat; $('#price250').value=p.prices[0]; $('#price350').value=p.prices[1]; $('#price500').value=p.prices[2]; $('#flavorBadge').value=p.badge || ''; selectedImageData=p.img || ''; if (selectedImageData) { $('#imagePreview').src=selectedImageData; $('#imagePreview').hidden=false; } $('#saveProductButton').textContent='Salvar alterações'; $('#cancelEditProduct').hidden=false; $('#flavorForm').classList.add('editing'); $('#flavorForm').scrollIntoView({behavior:'smooth',block:'start'}); }
  imageInput.addEventListener('change', () => { const file=imageInput.files && imageInput.files[0]; if (!file) return; if (!file.type.startsWith('image/')) { toast('Escolha um arquivo de imagem.'); imageInput.value=''; return; } const reader=new FileReader(); reader.onload=() => { selectedImageData=String(reader.result || ''); $('#imagePreview').src=selectedImageData; $('#imagePreview').hidden=false; }; reader.readAsDataURL(file); });
  if (!localStorage.getItem(EXTRA_KEY)) extras = DEFAULT_EXTRAS.map(item => ({...item}));
  let toastTimer;
  function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 2600); }
  function renderStats() { $('#statOrders').textContent = orders.length; $('#statNew').textContent = orders.filter(order => order.status === 'Novo').length; $('#statFlavors').textContent = customProducts.length; }
  function renderExtras() {
    if (!extras.length) { $('#extrasList').innerHTML = '<div class="empty">Nenhum acréscimo cadastrado. Adicione um acima. 🍫</div>'; return; }
    $('#extrasList').innerHTML = extras.map(extra => `<article class="flavor-row"><div><h3>🍫 ${escapeHtml(extra.name)}</h3><p class="muted">Acréscimo por baldinho: <strong>${money(extra.price)}</strong></p></div><div class="extra-actions"><button class="btn light" type="button" data-edit-extra="${escapeHtml(extra.id)}">Editar</button><button class="remove" type="button" data-remove-extra="${escapeHtml(extra.id)}">Excluir</button></div></article>`).join('');
  }
  function renderOrders() {
    const filtered = currentFilter === 'Todos' ? orders : orders.filter(order => order.status === currentFilter);
    if (!filtered.length) { $('#orders').innerHTML = '<div class="empty">Ainda não há pedidos nesta lista. 🍿<br>Quando houver pedidos registrados neste navegador, eles aparecerão aqui.</div>'; renderStats(); return; }
    $('#orders').innerHTML = filtered.map(order => {
      const date = order.createdAt ? new Date(order.createdAt).toLocaleString('pt-BR') : 'Data não informada';
      const items = (order.items || []).map(item => `<li>${Number(item.qty) || 1}x ${escapeHtml(item.name)} (${escapeHtml(item.size || '')}) — ${money((Number(item.unit)||0)*(Number(item.qty)||1))}${item.fillings?.length ? `<br><small>Recheios: ${escapeHtml(item.fillings.join(', '))}</small>` : ''}${item.extras?.length ? `<br><small>Adicionais: ${escapeHtml(item.extras.join(', '))}</small>` : ''}</li>`).join('');
      return `<article class="order"><div class="order-top"><div><h3>Pedido ${escapeHtml(order.id || '')} · ${escapeHtml(order.customer || 'Cliente')}</h3><div class="muted">${escapeHtml(date)}<br>${escapeHtml(order.deliveryMode === 'entrega' ? (order.address || 'Endereço não informado') : 'Retirada no local')}<br>Pagamento: ${escapeHtml(order.payment || 'Não informado')}</div></div><span class="pill">${escapeHtml(order.status || 'Novo')}</span></div><ul class="order-items">${items || '<li>Itens não informados</li>'}</ul>${order.observations ? `<p class="muted">Observação: ${escapeHtml(order.observations)}</p>` : ''}<div class="order-bottom"><strong>${money(order.total)}</strong><label>Atualizar status <select class="status" data-order="${escapeHtml(order.id)}"><option ${order.status==='Novo'?'selected':''}>Novo</option><option ${order.status==='Preparando'?'selected':''}>Preparando</option><option ${order.status==='Pronto'?'selected':''}>Pronto</option><option ${order.status==='Entregue'?'selected':''}>Entregue</option><option ${order.status==='Cancelado'?'selected':''}>Cancelado</option></select></label></div></article>`;
    }).join('');
    renderStats();
  }
  function renderFlavors() {
    if (!customProducts.length) { $('#flavors').innerHTML = '<div class="empty">Você ainda não adicionou sabores personalizados.</div>'; renderStats(); return; }
    $('#flavors').innerHTML = customProducts.map(product => { const cat = categories.find(item => item.id === product.cat); return `<article class="flavor-row"><div class="product-row-main">${product.img ? `<img src="${product.img}" alt="" class="product-thumb">` : ''}<div><h3>🍿 ${escapeHtml(product.name)}</h3><p class="muted">${escapeHtml(cat ? cat.name : 'Categoria')} · ${escapeHtml(product.desc)}<br>250 ml: ${money(product.prices[0])} · 350 ml: ${money(product.prices[1])} · 500 ml: ${money(product.prices[2])}</p></div></div><div class="extra-actions"><button class="btn light" type="button" data-edit-product="${escapeHtml(product.id)}">Editar</button><button class="remove" type="button" data-remove="${escapeHtml(product.id)}">Excluir</button></div></article>`; }).join('');
    renderStats();
  }
  $('#flavorForm').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('#flavorName').value.trim(); const desc = $('#flavorDesc').value.trim();
    const prices = [Number($('#price250').value), Number($('#price350').value), Number($('#price500').value)];
    if (!name || !desc || !$('#flavorCategory').value || prices.some(price => !Number.isFinite(price) || price <= 0)) { toast('Preencha nome, descrição, categoria e os três preços.'); return; }
    const wasEditing = editingProductId !== null;
    const currentId = editingProductId;
    const existing = wasEditing ? customProducts.find(item => String(item.id) === String(currentId)) : null;
    if (wasEditing && !existing) { toast('Não encontrei esse sabor. Atualize a lista e tente novamente.'); resetProductForm(); renderFlavors(); return; }
    const product = {id: wasEditing ? existing.id : 'product-' + Date.now(), cat: $('#flavorCategory').value, name, desc, prices, img: selectedImageData || (existing && existing.img) || 'assets/pipoca-ficticia.png', badge: $('#flavorBadge').value.trim()};
    const updatedProducts = wasEditing ? customProducts.map(item => String(item.id) === String(currentId) ? product : item) : [...customProducts, product];
    try { write(PRODUCT_KEY, updatedProducts); customProducts = updatedProducts; }
    catch(e) { toast('Não foi possível salvar. Tente uma foto menor e confira o espaço do navegador.'); return; }
    resetProductForm(); renderFlavors(); toast(wasEditing ? 'Sabor atualizado com sucesso!' : 'Sabor adicionado ao cardápio!');
  });
  $('#cancelEditProduct').addEventListener('click', resetProductForm);
  $('#flavors').addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-product]');
    if (edit) { editProduct(edit.dataset.editProduct); return; }
    const button = event.target.closest('[data-remove]'); if (!button) return;
    customProducts = customProducts.filter(product => product.id !== button.dataset.remove);
    write(PRODUCT_KEY, customProducts); renderFlavors(); toast('Produto removido do cardápio.');
  });
  $('#categoryForm').addEventListener('submit', event => {
    event.preventDefault(); const name=$('#categoryName').value.trim();
    if (!name) return;
    if (categories.some(cat => cat.name.toLowerCase() === name.toLowerCase())) { toast('Essa categoria já existe.'); return; }
    categories.push({id:categoryId(name),name});
    try { write(CATEGORY_KEY,categories); } catch(e) { categories.pop(); toast('Não foi possível salvar a categoria.'); return; }
    $('#categoryName').value=''; renderCategoryOptions(); toast('Categoria criada!');
  });
  $('#categoriesList').addEventListener('click', event => {
    const button=event.target.closest('[data-remove-category]'); if (!button) return;
    const id=button.dataset.removeCategory;
    if (customProducts.some(product => product.cat === id)) { toast('Mova ou exclua os produtos desta categoria antes de removê-la.'); return; }
    if (['baldinhos','chocolate'].includes(id)) { toast('As categorias originais não podem ser excluídas.'); return; }
    categories=categories.filter(cat=>cat.id!==id); write(CATEGORY_KEY,categories); renderCategoryOptions(); toast('Categoria excluída.');
  });

  $('#extraForm').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('#extraName').value.trim();
    const price = Number($('#extraPrice').value);
    if (!name || !Number.isFinite(price) || price < 0) { toast('Informe o nome e um preço válido.'); return; }
    extras.push({id: 'extra-' + Date.now(), name, price});
    try { write(EXTRA_KEY, extras); } catch(e) { extras.pop(); toast('Não foi possível salvar o acréscimo.'); return; }
    event.target.reset(); renderExtras(); toast('Acréscimo adicionado ao cardápio!');
  });
  $('#extrasList').addEventListener('click', event => {
    const removeButton = event.target.closest('[data-remove-extra]');
    if (removeButton) {
      extras = extras.filter(extra => extra.id !== removeButton.dataset.removeExtra);
      write(EXTRA_KEY, extras); renderExtras(); toast('Acréscimo excluído.'); return;
    }
    const editButton = event.target.closest('[data-edit-extra]');
    if (editButton) {
      const extra = extras.find(item => item.id === editButton.dataset.editExtra);
      if (!extra) return;
      const name = prompt('Nome do acréscimo:', extra.name);
      if (name === null) return;
      const priceText = prompt('Preço adicional em reais:', String(extra.price.toFixed(2)).replace('.', ','));
      if (priceText === null) return;
      const price = Number(priceText.replace(',', '.'));
      if (!name.trim() || !Number.isFinite(price) || price < 0) { toast('Nome ou preço inválido.'); return; }
      extra.name = name.trim(); extra.price = price;
      write(EXTRA_KEY, extras); renderExtras(); toast('Acréscimo atualizado.');
    }
  });
  $('#orders').addEventListener('change', event => {
    const select = event.target.closest('[data-order]'); if (!select) return;
    const order = orders.find(item => String(item.id) === select.dataset.order); if (!order) return;
    order.status = select.value; write(ORDER_KEY, orders); renderOrders(); toast('Status do pedido atualizado.');
  });
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item === button)); renderOrders();
  }));
  $('#refreshOrders').addEventListener('click', () => { orders = read(ORDER_KEY); customProducts = read(PRODUCT_KEY); extras = localStorage.getItem(EXTRA_KEY) ? read(EXTRA_KEY) : DEFAULT_EXTRAS.map(item => ({...item})); categories = localStorage.getItem(CATEGORY_KEY) ? read(CATEGORY_KEY) : DEFAULT_CATEGORIES.map(item => ({...item})); renderCategoryOptions(); renderOrders(); renderFlavors(); renderExtras(); toast('Painel atualizado.'); });
  renderCategoryOptions(); renderOrders(); renderFlavors(); renderExtras();
})();