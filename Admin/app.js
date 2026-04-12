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
      window.currentOutlet = admin.outlet;
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
$('loginBtn').onclick = () => {
  auth.signInWithEmailAndPassword(
    $('adminEmail').value,
    $('adminPassword').value
  ).catch(e => $('authError').textContent = e.message);
};

$('logoutBtn').onclick = () => auth.signOut();

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

        tr.innerHTML = `
                    <td>#${order.orderId}</td>
                    <td>${order.customerName}<br>${order.phone}</td>
                    <td>${items}</td>
                    <td>₹${order.total}</td>
                    <td>
                        <select onchange="updateOrderStatus('${order.id}', this.value)">
                            ${statusOptions(order.status)}
                        </select>
                    </td>
                `;

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

      container.innerHTML += `
                <div class="admin-card">
                    <button onclick="deleteItem('categories','${child.key}')">X</button>
                    <img src="${c.image}">
                    <h4>${c.name}</h4>
                </div>
            `;
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

      grid.innerHTML += `
                <div class="admin-card">
                    <button onclick="deleteItem('dishes','${child.key}')">X</button>
                    <img src="${d.imageUrl}">
                    <h4>${d.name}</h4>
                    <p>₹${d.price || '-'}</p>

                    <button onclick="openSize('${child.key}')">Sizes</button>
                    <button onclick="openAddon('${child.key}')">Addons</button>
                </div>
            `;
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

    db.ref(`addons/${currentOutlet}/${dishId}`).push({
      name,
      ...parsed
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