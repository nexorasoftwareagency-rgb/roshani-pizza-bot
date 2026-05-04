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
  const snap = await db.ref('admins').once('value');

  let found = false;

  snap.forEach(child => {
    const admin = child.val();

    if (admin.email === user.email) {
      currentOutlet = window.currentOutlet = admin.outlet;
      found = true;
    }
  });

  if (!found) {
    alert("No outlet assigned to this admin");
    return;
  }

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
    auth.signInWithEmailAndPassword(
      $('adminEmail').value,
      $('adminPassword').value
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
window.openSize = (dishId) => {
  const size = prompt("Enter sizes JSON\nExample:\n{\"Small\":250,\"Medium\":300}");

  if (!size) return;

  try {
    const parsed = JSON.parse(size);

    db.ref(`sizes/${currentOutlet}/${dishId}`).set(parsed);
    alert("Saved");
  } catch {
    alert("Invalid JSON");
  }
};

// =============================
// ADDONS SYSTEM
// =============================
window.openAddon = (dishId) => {
  const name = prompt("Addon Name (Extra Cheese)");

  if (!name) return;

  const price = prompt("Enter price JSON\nExample:\n{\"Small\":30,\"Medium\":40}");

  if (!price) return;

  try {
    const parsed = JSON.parse(price);

    const { name: _ignored, ...sanitizedParsed } = parsed;

    db.ref(`addons/${currentOutlet}/${dishId}`).push({
      name,
      ...sanitizedParsed
    });

    alert("Addon Added");
  } catch {
    alert("Invalid format");
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