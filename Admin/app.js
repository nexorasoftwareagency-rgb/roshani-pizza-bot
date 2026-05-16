// =============================
// GLOBAL STATE
// =============================
let currentOutlet = null;

const db = firebase.database();
const auth = firebase.auth();

const $ = (id) => document.getElementById(id);

// =============================
// AUTH + OUTLET DETECTION
// =============================
auth.onAuthStateChanged(async (user) => {

  if (!user) {
    document.getElementById('authOverlay').style.display = 'flex';
    return;
  }

  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('userEmailDisplay').textContent = user.email;

  // =============================
  // GET ADMIN OUTLET
  // =============================
  const snap = await db.ref('admins/' + user.uid).once('value');

  if (!snap.exists()) {
    alert("No outlet assigned to this admin. Contact Super Admin.");
    return;
  }

  const admin = snap.val();
  currentOutlet = window.currentOutlet = admin.outlet;

  console.log("Logged into outlet:", currentOutlet);

  // =============================
  // LOAD DATA
  // =============================
  initData();
});

// =============================
// LOGIN / LOGOUT
// =============================
const loginBtn = $('loginBtn');
if (loginBtn) {
  loginBtn.onclick = () => {
    const emailEl = $('adminEmail');
    const passEl = $('adminPassword');
    
    if (!emailEl || !passEl) {
      console.error("Login inputs not found");
      return;
    }

    auth.signInWithEmailAndPassword(
      emailEl.value,
      passEl.value
    ).catch(e => {
      const errEl = $('authError');
      if (errEl) errEl.textContent = e.message;
    });
  };
}

const logoutBtn = $('logoutBtn');
if (logoutBtn) {
  logoutBtn.onclick = () => auth.signOut();
}

// =============================
// INIT
// =============================
function initData() {
  loadOrders();
  loadCategories();
  loadDishes();
}

// =============================
// ORDERS
// =============================
function loadOrders() {
  db.ref('orders')
    .orderByChild('outlet')
    .equalTo(currentOutlet)
    .on('value', snap => {

      const container = $('ordersTableBody');
      container.innerHTML = '';

      let revenue = 0;
      let count = 0;

      const orders = [];

      snap.forEach(child => {
        orders.push({ id: child.key, ...child.val() });
      });

      orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      orders.forEach(order => {
        revenue += parseFloat(order.total || 0);
        count++;

        const items = order.cart
          ? order.cart.map(i => `${i.quantity}x ${i.name}`).join(', ')
          : '';

        const tr = document.createElement('tr');
        
        const tdId = document.createElement('td');
        tdId.textContent = `#${order.orderId || 'N/A'}`;
        tr.appendChild(tdId);

        const tdCust = document.createElement('td');
        tdCust.textContent = `${order.customerName || 'Guest'}`;
        tdCust.appendChild(document.createElement('br'));
        const spanPhone = document.createElement('span');
        spanPhone.textContent = order.phone || '';
        tdCust.appendChild(spanPhone);
        tr.appendChild(tdCust);

        const tdItems = document.createElement('td');
        tdItems.textContent = items;
        tr.appendChild(tdItems);

        const tdTotal = document.createElement('td');
        tdTotal.textContent = `₹${order.total || 0}`;
        tr.appendChild(tdTotal);

        const tdStatus = document.createElement('td');
        const select = document.createElement('select');
        select.onchange = (e) => updateOrderStatus(order.id, e.target.value);
        select.innerHTML = statusOptions(order.status);
        tdStatus.appendChild(select);
        tr.appendChild(tdStatus);

        container.appendChild(tr);
      });

      $('stat-revenue').textContent = '₹' + revenue;
      $('stat-orders').textContent = count;
    });
}

function statusOptions(current) {
  const list = [
    "Placed",
    "Confirmed",
    "Preparing",
    "Cooked",
    "Out for Delivery",
    "Delivered"
  ];

  return list.map(s =>
    `<option ${s === current ? 'selected' : ''}>${s}</option>`
  ).join('');
}

window.updateOrderStatus = (id, status) => {
  db.ref('orders/' + id).update({ status });
};

// =============================
// CATEGORIES
// =============================
function loadCategories() {
  db.ref(`categories/${currentOutlet}`).on('value', snap => {

    const container = $('categoryList');
    container.innerHTML = '';

    snap.forEach(child => {
      const c = child.val();

      const card = document.createElement('div');
      card.className = 'admin-card';

      const delBtn = document.createElement('button');
      delBtn.textContent = 'X';
      delBtn.onclick = () => deleteItem('categories', child.key);
      card.appendChild(delBtn);

      const img = document.createElement('img');
      img.src = c.image || '';
      card.appendChild(img);

      const h4 = document.createElement('h4');
      h4.textContent = c.name || '';
      card.appendChild(h4);

      container.appendChild(card);
    });
  });
}

$('saveCategoryBtn').onclick = () => {
  const name = $('categoryName').value;
  const image = $('categoryImage').value;

  if (!name) return alert("Enter category");

  db.ref(`categories/${currentOutlet}`).push({ name, image });

  $('categoryName').value = '';
  $('categoryImage').value = '';
};

// =============================
// DISHES
// =============================
function loadDishes() {
  db.ref(`dishes/${currentOutlet}`).on('value', snap => {

    const grid = $('dishesGrid');
    grid.innerHTML = '';

    snap.forEach(child => {
      const d = child.val();

      const card = document.createElement('div');
      card.className = 'admin-card';

      const delBtn = document.createElement('button');
      delBtn.textContent = 'X';
      delBtn.onclick = () => deleteItem('dishes', child.key);
      card.appendChild(delBtn);

      const img = document.createElement('img');
      img.src = d.imageUrl || '';
      card.appendChild(img);

      const h4 = document.createElement('h4');
      h4.textContent = d.name || '';
      card.appendChild(h4);

      const p = document.createElement('p');
      p.textContent = `₹${d.price || '-'}`;
      card.appendChild(p);

      const sizeBtn = document.createElement('button');
      sizeBtn.textContent = 'Sizes';
      sizeBtn.onclick = () => openSize(child.key);
      card.appendChild(sizeBtn);

      const addonBtn = document.createElement('button');
      addonBtn.textContent = 'Addons';
      addonBtn.onclick = () => openAddon(child.key);
      card.appendChild(addonBtn);

      grid.appendChild(card);
    });
  });
}

$('saveDishBtn').onclick = () => {
  const name = $('dishName').value;
  const price = $('dishPrice').value;
  const imageUrl = $('dishImage').value;
  const categoryId = $('dishCategory').value;

  if (!name || !categoryId) return alert("Fill all");

  db.ref(`dishes/${currentOutlet}`).push({
    name,
    price,
    imageUrl,
    categoryId
  });

  $('dishName').value = '';
  $('dishPrice').value = '';
  $('dishImage').value = '';
};

// =============================
// SIZES SYSTEM
// =============================
window.openPremiumModal = (title, htmlBody) => {
    return new Promise((resolve) => {
        const overlay = document.getElementById('premiumModalOverlay');
        const titleEl = document.getElementById('modalTitle');
        const bodyEl = document.getElementById('modalBody');
        const saveBtn = document.getElementById('modalSaveBtn');

        titleEl.innerText = title;
        bodyEl.innerHTML = htmlBody;

        overlay.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons({ root: overlay });

        const cleanup = () => {
            saveBtn.onclick = null;
            window.closePremiumModal = null;
            overlay.classList.add('hidden');
        };

        window.closePremiumModal = () => {
            cleanup();
            resolve(null);
        };

        saveBtn.onclick = () => {
            const inputs = {};
            bodyEl.querySelectorAll('input, textarea').forEach(el => {
                inputs[el.id] = el.value;
            });
            cleanup();
            resolve(inputs);
        };
    });
};

window.openSize = async (dishId) => {
  const html = `
    <div class="input-group">
      <label>Sizes JSON</label>
      <textarea id="modalSizeInput" placeholder='{"Small":250,"Medium":300}'></textarea>
      <p class="text-muted-small mt-5">Enter valid JSON mapping sizes to prices.</p>
    </div>
  `;
  const result = await window.openPremiumModal("Configure Sizes", html);
  if (!result || !result.modalSizeInput) return;

  try {
    const parsed = JSON.parse(result.modalSizeInput);
    db.ref(`sizes/${currentOutlet}/${dishId}`).set(parsed);
    window.showToast("Sizes saved successfully", "success");
  } catch {
    window.showToast("Invalid JSON format", "error");
  }
};

// =============================
// ADDONS SYSTEM
// =============================
window.openAddon = async (dishId) => {
  const html = `
    <div class="input-group">
      <label>Addon Name</label>
      <input type="text" id="modalAddonName" class="form-input" placeholder="e.g. Extra Cheese">
    </div>
    <div class="input-group">
      <label>Prices JSON</label>
      <textarea id="modalAddonPrice" placeholder='{"Small":30,"Medium":40}'></textarea>
    </div>
  `;
  const result = await window.openPremiumModal("Add New Addon", html);
  if (!result || !result.modalAddonName || !result.modalAddonPrice) return;

  try {
    const parsed = JSON.parse(result.modalAddonPrice);
    const { name: _ignored, ...sanitizedParsed } = parsed;

    db.ref(`addons/${currentOutlet}/${dishId}`).push({
      name: result.modalAddonName,
      ...sanitizedParsed
    });
    window.showToast("Addon added successfully", "success");
  } catch {
    window.showToast("Invalid JSON format", "error");
  }
};

// =============================
// DELETE
// =============================
window.deleteItem = (type, id) => {
  if (!confirm("Delete?")) return;

  db.ref(`${type}/${currentOutlet}/${id}`).remove();
};

// =============================
// NAVIGATION
// =============================
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(item.dataset.target).classList.add('active');
  });
});