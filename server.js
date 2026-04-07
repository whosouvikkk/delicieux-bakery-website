const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const db = {
  orders: [],
  reservations: [],
  nextOrderId: 1000,
  nextResId: 2000,
};


const MENU = [
  { id: 1, name: 'Classic Sourdough',   category: 'Bread',     price: 8.50,  available: true, desc: '48-hour fermented, heritage wheat.' },
  { id: 2, name: 'Almond Croissant',    category: 'Croissant', price: 5.50,  available: true, desc: 'Frangipane filled, toasted almonds.' },
  { id: 3, name: 'Blueberry Muffin',    category: 'Muffins',   price: 4.00,  available: true, desc: 'Wild blueberries, crumb topping.' },
  { id: 4, name: 'Honey Brioche',       category: 'Bread',     price: 9.00,  available: true, desc: 'Wildflower honey glaze, enriched dough.' },
  { id: 5, name: 'Raspberry Tart',      category: 'Tart',      price: 7.50,  available: true, desc: 'Vanilla custard, fresh raspberries.' },
  { id: 6, name: 'Chocolate Éclair',    category: 'Favorite',  price: 6.00,  available: true, desc: 'Choux pastry, dark chocolate glaze.' },
  { id: 7, name: 'Cinnamon Roll',       category: 'Favorite',  price: 5.00,  available: true, desc: 'Cream cheese frosting, house cinnamon blend.' },
  { id: 8, name: 'Lemon Tart',          category: 'Tart',      price: 7.00,  available: true, desc: 'Tangy lemon curd, shortcrust pastry.' },
  { id: 9, name: 'Carrot Cake Muffin',  category: 'Muffins',   price: 4.50,  available: true, desc: 'Walnut, cream cheese frosting.' },
  { id:10, name: 'Pain au Chocolat',    category: 'Croissant', price: 5.00,  available: true, desc: 'Viennoiserie, 72% dark chocolate.' },
];

function timestamp() { return new Date().toISOString(); }

function validateOrderPayload(body) {
  const required = ['name', 'email', 'phone', 'address', 'items'];
  const missing = required.filter(k => !body[k]);
  if (missing.length) return { ok: false, msg: `Missing fields: ${missing.join(', ')}` };
  if (!Array.isArray(body.items) || body.items.length === 0)
    return { ok: false, msg: 'Order must contain at least one item.' };
  return { ok: true };
}

function validateBookingPayload(body) {
  const required = ['name', 'email', 'phone', 'date', 'time', 'guests'];
  const missing = required.filter(k => !body[k]);
  if (missing.length) return { ok: false, msg: `Missing fields: ${missing.join(', ')}` };
  const bookDate = new Date(body.date);
  if (isNaN(bookDate) || bookDate < new Date(new Date().toDateString()))
    return { ok: false, msg: 'Booking date must be today or in the future.' };
  return { ok: true };
}

function calcOrderTotal(items) {
  return items.reduce((sum, item) => {
    const menuItem = MENU.find(m => m.id === item.menuItemId);
    if (!menuItem) return sum;
    return sum + menuItem.price * (item.qty || 1);
  }, 0);
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: timestamp(), service: 'Délicieux Bakery API' });
});

app.get('/api/menu', (req, res) => {
  const { category } = req.query;
  const items = category
    ? MENU.filter(m => m.category.toLowerCase() === category.toLowerCase())
    : MENU;
  res.json({ success: true, count: items.length, items });
});

app.get('/api/menu/:id', (req, res) => {
  const item = MENU.find(m => m.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ success: false, msg: 'Item not found.' });
  res.json({ success: true, item });
});

app.post('/api/orders', (req, res) => {
  const v = validateOrderPayload(req.body);
  if (!v.ok) return res.status(400).json({ success: false, msg: v.msg });

  const { name, email, phone, address, items, notes } = req.body;

  const enrichedItems = items.map(i => {
    const menuItem = MENU.find(m => m.id === i.menuItemId);
    return {
      menuItemId: i.menuItemId,
      name: menuItem ? menuItem.name : 'Unknown',
      price: menuItem ? menuItem.price : 0,
      qty: i.qty || 1,
      subtotal: menuItem ? menuItem.price * (i.qty || 1) : 0,
    };
  });

  const total = calcOrderTotal(items);

  const order = {
    id: `ORD-${db.nextOrderId++}`,
    status: 'received',       
    customer: { name, email, phone, address },
    items: enrichedItems,
    notes: notes || '',
    total: parseFloat(total.toFixed(2)),
    estimatedDelivery: '30–45 minutes',
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };

  db.orders.push(order);

  
  const statuses = ['received', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];
  let step = 0;
  const interval = setInterval(() => {
    step++;
    if (step < statuses.length) {
      const o = db.orders.find(o => o.id === order.id);
      if (o) { o.status = statuses[step]; o.updatedAt = timestamp(); }
    } else {
      clearInterval(interval);
    }
  }, 30000);

  res.status(201).json({
    success: true,
    msg: 'Order received! Confirmation sent to your email.',
    order,
  });
});


app.get('/api/orders/:id', (req, res) => {
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ success: false, msg: 'Order not found.' });
  res.json({ success: true, order });
});


app.get('/api/orders', (req, res) => {
  res.json({ success: true, count: db.orders.length, orders: db.orders });
});


app.patch('/api/orders/:id/status', (req, res) => {
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ success: false, msg: 'Order not found.' });
  const allowed = ['received', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
  if (!allowed.includes(req.body.status))
    return res.status(400).json({ success: false, msg: `Status must be one of: ${allowed.join(', ')}` });
  order.status = req.body.status;
  order.updatedAt = timestamp();
  res.json({ success: true, order });
});


app.post('/api/reservations', (req, res) => {
  const v = validateBookingPayload(req.body);
  if (!v.ok) return res.status(400).json({ success: false, msg: v.msg });

  const { name, email, phone, date, time, guests, notes } = req.body;

  const slotKey = `${date}_${time}`;
  const slotCount = db.reservations.filter(r => `${r.date}_${r.time}` === slotKey && r.status !== 'cancelled').length;
  if (slotCount >= 20) {
    return res.status(409).json({ success: false, msg: 'Sorry, this time slot is fully booked. Please choose another time.' });
  }

  const reservation = {
    id: `RES-${db.nextResId++}`,
    status: 'confirmed',         
    customer: { name, email, phone },
    date,
    time,
    guests: parseInt(guests) || 1,
    notes: notes || '',
    tableAssigned: null,       
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };

  db.reservations.push(reservation);

  res.status(201).json({
    success: true,
    msg: `Table booked for ${guests} guests on ${date} at ${time}. See you then!`,
    reservation,
  });
});


app.get('/api/reservations/:id', (req, res) => {
  const res_ = db.reservations.find(r => r.id === req.params.id);
  if (!res_) return res.status(404).json({ success: false, msg: 'Reservation not found.' });
  res.json({ success: true, reservation: res_ });
});


app.get('/api/reservations', (req, res) => {
  const { date } = req.query;
  const list = date
    ? db.reservations.filter(r => r.date === date)
    : db.reservations;
  res.json({ success: true, count: list.length, reservations: list });
});


app.delete('/api/reservations/:id', (req, res) => {
  const r = db.reservations.find(r => r.id === req.params.id);
  if (!r) return res.status(404).json({ success: false, msg: 'Reservation not found.' });
  r.status = 'cancelled';
  r.updatedAt = timestamp();
  res.json({ success: true, msg: 'Reservation cancelled.', reservation: r });
});


app.get('/api/availability', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ success: false, msg: 'Date is required.' });

  const times = ['8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM',
                 '1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM'];

  const slots = times.map(time => {
    const count = db.reservations.filter(r => r.date === date && r.time === time && r.status !== 'cancelled').length;
    return { time, available: count < 20, remainingSpots: Math.max(0, 20 - count) };
  });

  res.json({ success: true, date, slots });
});


app.listen(PORT, () => {
  console.log(`\n🥐  Délicieux Bakery API running on http://localhost:${PORT}`);
  console.log(`\n  Endpoints:`);
  console.log(`    GET    /api/health`);
  console.log(`    GET    /api/menu`);
  console.log(`    GET    /api/menu/:id`);
  console.log(`    POST   /api/orders`);
  console.log(`    GET    /api/orders/:id`);
  console.log(`    PATCH  /api/orders/:id/status`);
  console.log(`    POST   /api/reservations`);
  console.log(`    GET    /api/reservations/:id`);
  console.log(`    DELETE /api/reservations/:id`);
  console.log(`    GET    /api/availability?date=YYYY-MM-DD\n`);
});

module.exports = app;
