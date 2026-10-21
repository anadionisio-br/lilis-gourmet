(() => {
  'use strict';

  /* Altere preços, sabores e contato nesta parte. */
  const WHATSAPP = '5519989138914';
  const DELIVERY_FEE = 7;
  let EXTRAS = [
    {id: 'nutella', name: 'Nutella', price: 5},
    {id: 'galak', name: 'Galak', price: 6},
    {id: 'bombom', name: 'Bombom', price: 3}
  ];
  try {
    const savedExtras = JSON.parse(localStorage.getItem('lilis-extras-v1') || 'null');
    if (Array.isArray(savedExtras)) EXTRAS = savedExtras.filter(extra => extra && extra.id && extra.name && Number.isFinite(Number(extra.price))).map(extra => ({...extra, price: Number(extra.price)}));
  } catch (error) {}
  const SIZES = ['250 ml', '350 ml', '500 ml'];
  let PRODUCTS = [
    {id: 'trad', cat: 'baldinhos', name: 'Baldinho Tradicional', badge: 'Queridinha 💗',
      desc: 'Pipoca caramelizada crocante, com até 2 recheios sem custo.',
      img: 'assets/trad.jpg', prices: [18, 22, 25],
      fillings: ['Ninho', 'Avelã', 'Kinder Bueno'], maxFillings: 2},
    {id: 'nutella', cat: 'chocolate', name: 'Só Nutella', badge: 'Chocolate lover',
      desc: 'Pipoca coberta com Nutella.',
      img: 'assets/nutella.jpg', prices: [25, 27, 30]},
    {id: 'galak', cat: 'chocolate', name: 'Só Galak',
      desc: 'Pipoca coberta com chocolate branco Galak.',
      img: 'assets/galak.jpg', prices: [25, 27, 30]},
    {id: 'duo', cat: 'chocolate', name: 'Nutella e Galak', badge: 'R$ 30 em qualquer tamanho',
      desc: 'Os dois queridinhos juntos no mesmo baldinho.',
      img: 'assets/duo.jpg', prices: [30, 30, 30]}
  ];

  const PRODUCT_STORE = 'lilis-products-v1';
  const ORDER_STORE = 'lilis-orders-v1';

  try {
    const savedProducts = JSON.parse(localStorage.getItem(PRODUCT_STORE) || '[]');
    if (Array.isArray(savedProducts)) {
      savedProducts.forEach(product => {
        if (product && product.id && product.name && Array.isArray(product.prices) && product.prices.length === 3) {
          const existing = PRODUCTS.findIndex(item => item.id === product.id);
          if (existing >= 0) PRODUCTS[existing] = product;
          else PRODUCTS.push(product);
        }
      });
    }
  } catch (error) {}

  const $ = s => document.querySelector(s);
  const money = v => Number(v).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STORE = 'lilis-cart-v1';
  const itemDialog = $('#itemDialog');
  const orderSection = $('#pedido');
  let cart = [];
  let cur = null;
  let toastTimer;

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE));
      if (!Array.isArray(saved)) return [];
      return saved.filter(l =>
        l && typeof l.pid === 'string' &&
        PRODUCTS.some(p => p.id === l.pid) &&
        Number.isFinite(Number(l.unit)) && Number(l.unit) >= 0 &&
        Number.isFinite(Number(l.qty)) && Number(l.qty) > 0
      ).map(l => ({
        ...l,
        unit: Number(l.unit),
        qty: Math.min(30, Math.floor(Number(l.qty))),
        fillings: Array.isArray(l.fillings) ? l.fillings : [],
        extras: Array.isArray(l.extras) ? l.extras : [],
        note: String(l.note || ''),
        size: SIZES.includes(l.size) ? l.size : SIZES[0]
      }));
    } catch (e) {
      return [];
    }
  }
  cart = loadCart();
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(cart)); } catch (e) {} };

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
  }

  /* Cardápio */
  function renderMenu() {
    const customCats = (() => { try { const c = JSON.parse(localStorage.getItem('lilis-categories-v1') || '[]'); return Array.isArray(c) ? c : []; } catch(e) { return []; } })();
    customCats.forEach(cat => {
      if (document.getElementById('list-' + cat.id)) return;
      const section = document.createElement('section'); section.className = 'menu-category'; section.id = 'category-' + cat.id;
      section.innerHTML = `<div class="container"><h2>${esc(cat.name)}</h2><div class="items-grid" id="list-${esc(cat.id)}"></div></div>`;
      const menu = document.querySelector('#menu') || document.querySelector('.menu') || document.querySelector('main');
      if (menu) menu.appendChild(section);
    });
    PRODUCTS.forEach(p => {
      const priceLabel = p.prices.every(v => v === p.prices[0]) ? 'Qualquer tamanho' : 'A partir de';
      const html = `
        <article class="item">
          <div class="item-image-wrap"><img src="${p.img}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('no-image')"><span class="image-emoji" aria-hidden="true">🍿</span></div>
          <div class="item-main">
            ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}
            <h3>${esc(p.name)}</h3>
            <p>${esc(p.desc)}</p>
            <div class="item-foot"><div class="price">${priceLabel}<strong>${money(p.prices[0])}</strong></div><button class="add" type="button" data-id="${p.id}">Escolher <span aria-hidden="true">＋</span></button></div>
          </div>
        </article>`;
      const list = $('#list-' + p.cat) || $('#list-chocolate') || $('#list-baldinhos');
      if (list) list.insertAdjacentHTML('beforeend', html);
    });
    document.querySelectorAll('.add').forEach(b => b.addEventListener('click', () => openItem(b.dataset.id)));
  }

  function unitPrice() {
    const base = cur.product.prices[cur.size];
    const extrasPrice = [...cur.extras].reduce((sum, id) => {
      const extra = EXTRAS.find(e => e.id === id);
      return sum + (extra ? extra.price : 0);
    }, 0);
    return base + extrasPrice;
  }

  function updateItemTotal() {
    if (!cur) return;
    $('#itemQty').textContent = cur.qty;
    $('#itemTotal').textContent = money(unitPrice() * cur.qty);
  }

  function openItem(id) {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;
    cur = {product: p, size: 0, fillings: new Set(), extras: new Set(), qty: 1};
    $('#itemImg').src = p.img;
    $('#itemImg').onerror = () => { $('#itemImg').style.visibility = 'hidden'; };
    $('#itemImg').onload = () => { $('#itemImg').style.visibility = 'visible'; };
    $('#itemTitle').textContent = p.name;
    $('#itemDesc').textContent = p.desc;

    let h = `<div class="group"><h3>Tamanho <small>escolha 1</small></h3><div class="opt-list cols">` +
      SIZES.map((s, i) => `<label class="opt"><input type="radio" name="size" value="${i}" ${i === 0 ? 'checked' : ''}><span>${s}<em>${money(p.prices[i])}</em></span></label>`).join('') +
      `</div></div>`;

    if (p.fillings) {
      h += `<div class="group"><h3>Recheios <small>até ${p.maxFillings}, grátis</small></h3><div class="opt-list">` +
        p.fillings.map(f => `<label class="opt"><input type="checkbox" name="fill" value="${esc(f)}"><span>${esc(f)}<em>Grátis</em></span></label>`).join('') +
        `</div></div>`;
    }

    h += `<div class="group"><h3>Adicionais <small>opcional</small></h3><div class="opt-list">` +
      (EXTRAS.length ? EXTRAS.map(e => `<label class="opt"><input type="checkbox" name="extra" value="${esc(e.id)}"><span>${esc(e.name)}<em>+ ${money(e.price)}</em></span></label>`).join('') : '<p class="muted">Nenhum acréscimo disponível no momento.</p>') +
      `</div></div>`;
    h += `<div class="group"><h3>Observação <small>opcional</small></h3><textarea class="note-input" id="itemNote" rows="2" maxlength="250" placeholder="Ex.: para presente, pouca calda..."></textarea></div>`;

    $('#itemBody').innerHTML = h;
    $('#itemBody').scrollTop = 0;
    updateItemTotal();
    itemDialog.showModal();
  }

  $('#itemBody').addEventListener('change', e => {
    const t = e.target;
    if (!cur) return;
    if (t.name === 'size') cur.size = Number(t.value);
    if (t.name === 'extra') t.checked ? cur.extras.add(t.value) : cur.extras.delete(t.value);
    if (t.name === 'fill') {
      if (t.checked && cur.fillings.size >= cur.product.maxFillings) {
        t.checked = false;
        toast('Você pode escolher até 2 recheios grátis.');
        return;
      }
      t.checked ? cur.fillings.add(t.value) : cur.fillings.delete(t.value);
      document.querySelectorAll('input[name="fill"]').forEach(i => {
        i.disabled = !i.checked && cur.fillings.size >= cur.product.maxFillings;
      });
    }
    updateItemTotal();
  });

  $('#itemMinus').addEventListener('click', () => { if (cur) { cur.qty = Math.max(1, cur.qty - 1); updateItemTotal(); } });
  $('#itemPlus').addEventListener('click', () => { if (cur) { cur.qty = Math.min(30, cur.qty + 1); updateItemTotal(); } });

  $('#itemAdd').addEventListener('click', () => {
    if (!cur) return;
    const note = ($('#itemNote').value || '').trim();
    const line = {
      pid: cur.product.id, name: cur.product.name, size: SIZES[cur.size],
      unit: unitPrice(), qty: cur.qty, note,
      fillings: [...cur.fillings],
      extras: [...cur.extras].map(id => EXTRAS.find(e => e.id === id)?.name || id)
    };
    const key = JSON.stringify([line.pid, line.size, line.fillings, line.extras, line.note]);
    const same = cart.find(l => l.key === key);
    if (same) same.qty = Math.min(30, same.qty + line.qty);
    else cart.push({...line, key});
    save();
    renderCart();
    itemDialog.close();
    toast(`${line.name} adicionado ao pedido! 💗`);
    const bar = $('#cartBar');
    bar.classList.remove('bump');
    void bar.offsetWidth;
    bar.classList.add('bump');
  });

  /* Carrinho e totais */
  const mode = () => document.querySelector('input[name="mode"]:checked').value;
  const pay = () => document.querySelector('input[name="pay"]:checked').value;
  const subtotal = () => cart.reduce((sum, l) => sum + l.unit * l.qty, 0);
  const count = () => cart.reduce((sum, l) => sum + l.qty, 0);
  const fee = () => cart.length && mode() === 'entrega' ? DELIVERY_FEE : 0;

  function renderCart() {
    const n = count();
    $('#cartBar').hidden = n === 0;
    $('#barCount').textContent = n;
    $('#barLabel').textContent = n === 1 ? 'item' : 'itens';
    $('#barTotal').textContent = money(subtotal() + fee());
    const topCount = $('#topCartCount');
    topCount.hidden = n === 0;
    topCount.textContent = n;

    const empty = cart.length === 0;
    $('#cartEmpty').hidden = !empty;
    $('#cartFilled').hidden = empty;
    $('#cartFoot').hidden = empty;
    $('#cartLines').innerHTML = cart.map((l, i) => {
      const meta = [l.size];
      if (l.fillings.length) meta.push('Recheios: ' + l.fillings.join(', '));
      if (l.extras.length) meta.push('Adicionais: ' + l.extras.join(', '));
      if (l.note) meta.push('Obs.: ' + l.note);
      return `<li class="line"><h3>${esc(l.name)}</h3><span class="lp">${money(l.unit * l.qty)}</span><p class="meta">${meta.map(esc).join(' · ')}</p><div class="ctrl"><div class="stepper"><button type="button" data-act="minus" data-i="${i}" aria-label="Diminuir ${esc(l.name)}">−</button><output>${l.qty}</output><button type="button" data-act="plus" data-i="${i}" aria-label="Aumentar ${esc(l.name)}">+</button></div><button type="button" class="rm" data-act="rm" data-i="${i}">Remover</button></div></li>`;
    }).join('');
    updateTotals();
  }

  function updateTotals() {
    $('#tSub').textContent = money(subtotal());
    $('#tFee').textContent = mode() === 'entrega' && cart.length ? money(DELIVERY_FEE) : 'Grátis';
    $('#tTotal').textContent = money(subtotal() + fee());
    $('#barTotal').textContent = money(subtotal() + fee());
  }

  $('#cartLines').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const i = Number(b.dataset.i);
    const line = cart[i];
    if (!line) return;
    if (b.dataset.act === 'plus') line.qty = Math.min(30, line.qty + 1);
    if (b.dataset.act === 'minus') line.qty -= 1;
    if (b.dataset.act === 'rm' || line.qty <= 0) cart.splice(i, 1);
    save();
    renderCart();
  });

  const openCart = () => {
    renderCart();
    orderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('#openCart').addEventListener('click', openCart);
  $('#topCartBtn').addEventListener('click', () => {
    if (!cart.length) {
      toast('Seu carrinho está vazio. Escolha um baldinho! 🍿');
      document.querySelector('#cardapio').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      openCart();
    }
  });

  document.querySelectorAll('#itemDialog [data-close]').forEach(b => b.addEventListener('click', () => itemDialog.close()));
  itemDialog.addEventListener('click', e => { if (e.target === itemDialog) itemDialog.close(); });
  $('#addMoreItems').addEventListener('click', () => {
    document.querySelector('#cardapio').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', () => {
    $('#addressBox').hidden = mode() !== 'entrega';
    renderCart();
  }));
  document.querySelectorAll('input[name="pay"]').forEach(r => r.addEventListener('change', () => {
    $('#changeBox').hidden = pay() !== 'Dinheiro';
  }));

  function setErr(inputId, errId, msg) {
    const input = $('#' + inputId);
    const field = input.closest('.field');
    $('#' + errId).textContent = msg;
    field.classList.toggle('bad', !!msg);
  }

  document.querySelectorAll('.field input').forEach(input => input.addEventListener('input', () => {
    const field = input.closest('.field');
    field.classList.remove('bad');
    const error = field.querySelector('.err');
    if (error) error.textContent = '';
  }));

  function validate() {
    let first = null;
    let ok = true;
    const check = (id, err, condition, message) => {
      const invalid = !condition;
      setErr(id, err, invalid ? message : '');
      if (invalid) {
        ok = false;
        if (!first) first = $('#' + id);
      }
    };
    check('fName', 'errName', $('#fName').value.trim().length >= 2, 'Informe seu nome.');
    if (mode() === 'entrega') {
      check('fStreet', 'errStreet', $('#fStreet').value.trim().length > 0, 'Informe a rua.');
      check('fNumber', 'errNumber', $('#fNumber').value.trim().length > 0, 'Informe o número.');
      check('fDistrict', 'errDistrict', $('#fDistrict').value.trim().length > 0, 'Informe o bairro.');
    } else {
      setErr('fStreet', 'errStreet', '');
      setErr('fNumber', 'errNumber', '');
      setErr('fDistrict', 'errDistrict', '');
    }
    if (first) first.focus();
    return ok;
  }

  /* Envio para o WhatsApp */
  $('#sendWa').addEventListener('click', () => {
    if (!cart.length) return;
    if (!validate()) {
      toast('Preencha os campos destacados. 💗');
      return;
    }

    const lines = [];
    lines.push('*Novo pedido — Lilis Gourmet* 🍿', '');
    lines.push(`*Cliente:* ${$('#fName').value.trim()}`, '', '*Itens do pedido*');
    cart.forEach(l => {
      lines.push(`• ${l.qty}x ${l.name} (${l.size}) — ${money(l.unit * l.qty)}`);
      if (l.fillings.length) lines.push(`   Recheios: ${l.fillings.join(', ')}`);
      if (l.extras.length) lines.push(`   Adicionais: ${l.extras.join(', ')}`);
      if (l.note) lines.push(`   Obs.: ${l.note}`);
    });
    lines.push('', `Subtotal: ${money(subtotal())}`);
    if (mode() === 'entrega') lines.push(`Taxa de entrega: ${money(DELIVERY_FEE)}`);
    lines.push(`*Total: ${money(subtotal() + fee())}*`, '');

    if (mode() === 'entrega') {
      const complement = $('#fComplement').value.trim();
      const address = `${$('#fStreet').value.trim()}, ${$('#fNumber').value.trim()} — ${$('#fDistrict').value.trim()}`;
      lines.push('*Entrega*', address + (complement ? ` (${complement})` : ''));
    } else {
      lines.push('*Retirada no local*');
    }
    lines.push('', `*Pagamento:* ${pay()}`);
    if (pay() === 'Dinheiro') {
      const change = $('#fChange').value.trim();
      lines.push(change ? `Troco para: ${change.replace(/^R\$\s*/i, '')}` : 'Sem necessidade de troco');
    }
    const note = $('#fNote').value.trim();
    if (note) lines.push('', `*Observações:* ${note}`);

    // Salva uma cópia local para demonstração do painel administrativo.
    // Para receber pedidos de outros celulares/computadores, é necessário backend e banco de dados.
    try {
      const savedOrders = JSON.parse(localStorage.getItem(ORDER_STORE) || '[]');
      savedOrders.unshift({
        id: 'LG-' + Date.now().toString().slice(-8),
        createdAt: new Date().toISOString(),
        customer: $('#fName').value.trim(),
        items: cart.map(item => ({...item})),
        subtotal: subtotal(),
        deliveryFee: fee(),
        total: subtotal() + fee(),
        deliveryMode: mode(),
        address: mode() === 'entrega' ? `${$('#fStreet').value.trim()}, ${$('#fNumber').value.trim()} — ${$('#fDistrict').value.trim()} ${$('#fComplement').value.trim()}`.trim() : 'Retirada no local',
        payment: pay(),
        observations: $('#fNote').value.trim(),
        status: 'Novo'
      });
      localStorage.setItem(ORDER_STORE, JSON.stringify(savedOrders));
    } catch (error) {}

    const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(lines.join('\n'))}`;
    const opened = window.open(url, '_blank');
    if (!opened) window.location.href = url;
    toast('Confira a mensagem e envie pelo WhatsApp.');
  });

  /* Destaque automático da categoria visível */
  const cats = [...document.querySelectorAll('.cat')];
  const blocks = cats.map(c => document.querySelector(c.getAttribute('href')));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) cats.forEach((cat, i) => cat.classList.toggle('active', blocks[i] === entry.target));
    }), {rootMargin: '-25% 0px -60% 0px'});
    blocks.forEach(block => observer.observe(block));
  }

  renderMenu();
  renderCart();
  $('#addressBox').hidden = mode() !== 'entrega';
  $('#changeBox').hidden = pay() !== 'Dinheiro';
})();
