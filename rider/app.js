// =============================
// GLOBAL
// =============================
const db = firebase.database();
const auth = firebase.auth();

let currentOrderId = null;
let currentOrder = null;
let currentUser = null;

// =============================
// LOGIN
// =============================
window.login = () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;

    auth.signInWithEmailAndPassword(email, pass)
        .catch(e => alert(e.message));
};

window.logout = () => auth.signOut();

auth.onAuthStateChanged(user => {
    if (!user) {
        document.getElementById('loginBox').style.display = 'block';
        document.getElementById('dashboard').style.display = 'none';
        return;
    }

    currentUser = user;

    document.getElementById('loginBox').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';

    loadOrders();
});

// =============================
// LOAD ORDERS
// =============================
function loadOrders() {

    db.ref('orders').on('value', snap => {

        const pizzaDiv = document.getElementById('pizzaOrders');
        const cakeDiv = document.getElementById('cakeOrders');

        pizzaDiv.innerHTML = '';
        cakeDiv.innerHTML = '';

        let totalDelivered = 0;
        let totalEarning = 0;

        snap.forEach(child => {
            const id = child.key;
            const o = child.val();

            // Only show orders ready for rider
            if (o.status !== "Out for Delivery") return;

            const card = createOrderCard(id, o);

            if (o.outlet === "pizza") pizzaDiv.appendChild(card);
            else if (o.outlet === "cake") cakeDiv.appendChild(card);

            // Stats
            if (o.status === "Delivered") {
                totalDelivered++;
                totalEarning += parseFloat(o.total || 0);
            }

        });

        updateStats(totalDelivered, totalEarning);
    });
}

// =============================
// CREATE ORDER CARD
// =============================
function createOrderCard(id, o) {

    const div = document.createElement('div');
    div.className = "order-card";

    div.innerHTML = `
    <h4>Order #${o.orderId}</h4>
    <p>👤 ${o.customerName}</p>
    <p>📞 ${o.receiverPhone || o.phone}</p>
    <p>🏠 ${o.address}</p>
    <p>💰 ₹${o.total}</p>

    <button onclick="openDeliveryPanel('${id}')">Deliver</button>
  `;

    return div;
}

// =============================
// STATS
// =============================
function updateStats(delivered, earning) {

    let statsDiv = document.getElementById('stats');

    if (!statsDiv) {
        statsDiv = document.createElement('div');
        statsDiv.id = "stats";
        statsDiv.style.padding = "15px";
        document.getElementById('dashboard').prepend(statsDiv);
    }

    statsDiv.innerHTML = `
    <h3>📊 Performance</h3>
    <p>Delivered Orders: ${delivered}</p>
    <p>Total Earnings: ₹${earning}</p>
  `;
}

// =============================
// DELIVERY PANEL
// =============================
window.openDeliveryPanel = async (orderId) => {

    currentOrderId = orderId;

    const snap = await db.ref('orders/' + orderId).once('value');
    currentOrder = snap.val();

    document.getElementById('otpPanel').style.display = 'block';
    document.getElementById('otpInput').value = '';
};

window.sendOTP = async () => {
  if (!currentOrder) return;

  const otp = Math.floor(1000 + Math.random() * 9000);

  await updateData(`orders/${currentOrderId}`, {
    deliveryOTP: otp,
    otpStatus: "sent",
    otpSentAt: new Date().toISOString()
  });

  alert("OTP sent to customer");
};

// =============================
// VERIFY OTP
// =============================
window.verifyOTP = async () => {

    const entered = document.getElementById('otpInput').value;

    if (!entered) {
        alert("Enter OTP");
        return;
    }

    const snap = await db.ref('orders/' + currentOrderId).once('value');
    const order = snap.val();

    // NORMAL OTP
    if (entered == order.deliveryOTP) {
        completeDelivery("verified");
        return;
    }

    // ADMIN OTP
    if (entered == order.adminOTP && !order.adminOTPUsed) {

        await db.ref('orders/' + currentOrderId).update({
            adminOTPUsed: true
        });

        completeDelivery("admin_override");
        return;
    }

    alert("Invalid OTP");
};

// =============================
// COMPLETE DELIVERY
// =============================
async function completeDelivery(type) {

    const method = prompt("Payment received?\n1 Cash\n2 UPI");

    if (!method) return;

    await db.ref('orders/' + currentOrderId).update({
        status: "Delivered",
        otpStatus: type,
        paymentStatus: "paid",
        deliveredBy: currentUser.email,
        deliveredAt: new Date().toISOString()
    });

    alert("Order Delivered");

    document.getElementById('otpPanel').style.display = 'none';
}

// =============================
// CLOSE PANEL
// =============================
window.closeOTPPanel = () => {
    document.getElementById('otpPanel').style.display = 'none';
};