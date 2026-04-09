require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const Stripe = require("stripe");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const DOMAIN = process.env.DOMAIN || "http://localhost:3000";

const PRICE_MAP = {
  model_monthly: process.env.STRIPE_PRICE_MODEL_MONTHLY, // 9,800円
  ai_code_once: process.env.STRIPE_PRICE_AI_CODE_ONCE    // 20,000円
};

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { addons, customer } = req.body;
    console.log("受信データ:", { addons, customer }); // ログを出して何が届いているか確認

    // ① 基本料 9,800円
    const line_items = [{
      price: PRICE_MAP.model_monthly,
      quantity: 1
    }];

    // ② アドオンの強制判定
    // addonsに何か1つでも入っていれば、名前を問わず20,000円を足す設定に変更
    if (addons && Array.isArray(addons) && addons.length > 0) {
      console.log("20,000円アドオンを追加します");
      line_items.push({
        price: PRICE_MAP.ai_code_once,
        quantity: 1
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: customer?.email,
      line_items: line_items,
      success_url: `${DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${DOMAIN}/cancel.html`
    });

    res.json({ sessionId: session.id, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
  } catch (error) {
    console.error("エラー内容:", error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));