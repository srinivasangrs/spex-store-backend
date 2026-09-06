import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();
const { Pool } = pg;
const app = express();
const port = process.env.PORT || 5000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ success: true, message: "SPEX API is running", database: "connected" });
  } catch {
    res.status(503).json({ success: false, message: "Database not connected", database: "disconnected" });
  }
});

app.get("/api/products", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id,name,category,description,price,discount,image,stock,created_at
       FROM products ORDER BY id`
    );
    res.json({ success: true, products: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Unable to fetch products" });
  }
});

app.get("/api/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: "Invalid product id" });

  try {
    const { rows } = await pool.query(
      `SELECT id,name,category,description,price,discount,image,stock,created_at
       FROM products WHERE id=$1`, [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Product not found" });
    res.json({ success: true, product: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Unable to fetch product" });
  }
});

app.post("/api/orders", async (req, res) => {
  const { customer, items, paymentMethod = "COD" } = req.body;
  if (!customer?.name?.trim() || !customer?.mobile?.trim() || !customer?.address?.trim()) {
    return res.status(400).json({ success: false, message: "Name, mobile and address are required" });
  }
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ success: false, message: "At least one product is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const customerResult = await client.query(
      `INSERT INTO customers(name,mobile,email,address) VALUES($1,$2,$3,$4)
       RETURNING id,name,mobile,email,address`,
      [customer.name.trim(), customer.mobile.trim(), (customer.email || "").trim(), customer.address.trim()]
    );

    const ids = items.map(i => Number(i.productId));
    const productResult = await client.query(
      `SELECT id,name,price,discount,stock FROM products WHERE id=ANY($1::int[])`, [ids]
    );
    const products = new Map(productResult.rows.map(p => [p.id, p]));

    let subtotal = 0, discount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = products.get(Number(item.productId));
      const quantity = Number(item.quantity);
      if (!product) throw new Error("Product not found");
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Invalid quantity");
      if (quantity > product.stock) throw new Error(`${product.name} has only ${product.stock} item(s) in stock`);

      const line = Number(product.price) * quantity;
      subtotal += line;
      discount += line * Number(product.discount || 0) / 100;
      orderItems.push({ id: product.id, quantity, price: Number(product.price) });
    }

    const taxable = subtotal - discount;
    const gst = taxable * 0.18;
    const total = taxable + gst;
    const invoiceNumber = `SPEX-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${Date.now().toString().slice(-6)}`;

    const orderResult = await client.query(
      `INSERT INTO orders(customer_id,invoice_number,subtotal,discount,gst,total,payment_method,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,'PLACED') RETURNING *`,
      [customerResult.rows[0].id, invoiceNumber, subtotal.toFixed(2), discount.toFixed(2), gst.toFixed(2), total.toFixed(2), paymentMethod]
    );

    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items(order_id,product_id,quantity,price) VALUES($1,$2,$3,$4)`,
        [orderResult.rows[0].id, item.id, item.quantity, item.price]
      );
      await client.query(`UPDATE products SET stock=stock-$1 WHERE id=$2`, [item.quantity, item.id]);
    }

    await client.query("COMMIT");
    const o = orderResult.rows[0];

    res.status(201).json({
      success: true,
      order: {
        id: o.id,
        invoiceNumber: o.invoice_number,
        customer: customerResult.rows[0],
        subtotal: Number(o.subtotal),
        discount: Number(o.discount),
        gst: Number(o.gst),
        total: Number(o.total),
        paymentMethod: o.payment_method,
        status: o.status,
        createdAt: o.created_at
      }
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(400).json({ success: false, message: e.message || "Unable to create order" });
  } finally {
    client.release();
  }
});

app.get("/api/orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: "Invalid order id" });

  try {
    const order = await pool.query(
      `SELECT o.*,c.name AS customer_name,c.mobile,c.email,c.address
       FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=$1`, [id]
    );
    if (!order.rows.length) return res.status(404).json({ success: false, message: "Order not found" });

    const items = await pool.query(
      `SELECT oi.id,oi.product_id,p.name,p.category,oi.quantity,oi.price
       FROM order_items oi JOIN products p ON p.id=oi.product_id
       WHERE oi.order_id=$1 ORDER BY oi.id`, [id]
    );

    res.json({ success: true, order: order.rows[0], items: items.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Unable to fetch order" });
  }
});

app.listen(port, () => console.log(`SPEX API running at http://localhost:${port}`));