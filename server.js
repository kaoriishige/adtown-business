require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const Stripe = require("stripe");
const nodemailer = require("nodemailer");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.static(path.join(__dirname)));

const DOMAIN = process.env.DOMAIN || "http://localhost:3000";

const PRICE_MAP = {
  model_monthly: {
    mode: "subscription",
    priceId: process.env.STRIPE_PRICE_MODEL_MONTHLY
  },
  regular_monthly: {
    mode: "subscription",
    priceId: process.env.STRIPE_PRICE_REGULAR_MONTHLY
  },
  ai_code_once: {
    mode: "payment",
    priceId: process.env.STRIPE_PRICE_AI_CODE_ONCE
  }
};

// このエンドポイントはJSONを受け取るために設定する
app.post("/create-checkout-session", express.json(), async (req, res) => {
  try {
    const { plan, customer } = req.body;

    if (!plan || !PRICE_MAP[plan]) {
      return res.status(400).json({ error: "不正なプランです。" });
    }

    if (!customer?.name || !customer?.shop || !customer?.email) {
      return res.status(400).json({ error: "顧客情報が不足しています。" });
    }

    const selected = PRICE_MAP[plan];

    const session = await stripe.checkout.sessions.create({
      mode: selected.mode,
      payment_method_types: ["card"],
      customer_email: customer.email,
      line_items: [
        {
          price: selected.priceId,
          quantity: 1
        }
      ],
      metadata: {
        name: customer.name,
        shop: customer.shop,
        email: customer.email,
        tel: customer.tel || "",
        industry: customer.industry || "",
        website: customer.website || "",
        message: customer.message || "",
        plan
      },
      success_url: `${DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${DOMAIN}/cancel.html`
    });

    return res.json({
      sessionId: session.id,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Stripeセッションの作成に失敗しました。"
    });
  }
});

// 顧客情報をファイルに保存する関数
function saveCustomerInfo(customerData) {
  const filePath = path.join(__dirname, "customers.json");
  let customers = [];
  
  // 既にファイルが存在する場合は読み込む
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, "utf8");
      customers = JSON.parse(data);
    } catch (e) {
      console.error("ファイルの読み込みエラー:", e);
    }
  }
  
  // 新しい顧客データを追加して保存
  customers.push(customerData);
  fs.writeFileSync(filePath, JSON.stringify(customers, null, 2));
}

// 自動返信メール用設定 (Nodemailer)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

async function sendThanksEmail(customerEmail, customerName, shopName) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    console.log("⚠️ Gmail設定がないためサンクスメールの自動送信をスキップしました");
    return;
  }

  const mailOptions = {
    from: `"株式会社adtown" <${process.env.GMAIL_USER}>`,
    to: customerEmail,
    subject: `【株式会社adtown】モデル事業へのお申し込みありがとうございます`,
    text: `${shopName}
${customerName} 様

この度は「AI決済特化モデル事業」へのお申し込み、
ならびに初期お手続き（決済）をいただき誠にありがとうございます。
株式会社adtownの担当と申します。

無事にクレジットカードでの初期設定および情報のご登録を確認いたしました。
今後は、AI時代に選ばれる店舗（企業）作りを全力でサポートさせていただきます。

【今後の流れについて】
1. 現在の Googleビジネスプロフィールの状況や、
   ホームページの分析を弊社にて実施いたします。
2. その後、改めて担当者より、具体的な施策やヒアリングについてご連絡差し上げます。

ご不明な点がございましたら、本メールへのご返信にてお気軽にお問い合わせください。
引き続きよろしくお願い申し上げます。

--------------------------------------------------
株式会社adtown
〒329-2711 栃木県那須塩原市石林698-35
--------------------------------------------------`
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ 自動サンクスメール送信完了: ${customerEmail}`);
  } catch (error) {
    console.error("❌ メール送信エラー:", error);
  }
}

/**
 * Webhook
 * Stripe公式でも、checkout.session.completed や invoice.paid などを受けて
 * サービス付与や成約処理を行う構成が推奨されています。
 */
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed.", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case "checkout.session.completed":
      const session = event.data.object;
      console.log("✅ Checkout完了:", session.id);

      // お客様番号（カスタマーID）が存在すればノートに記録する
      if (session.customer) {
        const customerInfo = {
          date: new Date().toLocaleString("ja-JP"), // 決済日時
          customerId: session.customer, // Stripeの顧客ID (cus_xxx)
          email: session.customer_details?.email || session.customer_email || "", // メールアドレス
          name: session.metadata?.name || "名前未設定", // 決済時に渡した名前
          shop: session.metadata?.shop || "店舗未設定", // 決済時に渡した店舗名
          plan: session.metadata?.plan || "不明" // 申し込んだプラン
        };
        
        saveCustomerInfo(customerInfo);
        console.log(`📝 [記録完了] ${customerInfo.name} 様の顧客ID(${customerInfo.customerId})をノートに保存しました！`);

        // ★自動サンクスメールを送信！
        if (customerInfo.email) {
          sendThanksEmail(customerInfo.email, customerInfo.name, customerInfo.shop);
        }
      }
      break;

    case "invoice.paid":
      console.log("✅ サブスク請求成功:", event.data.object.id);
      break;

    case "invoice.payment_failed":
      console.log("⚠️ サブスク請求失敗:", event.data.object.id);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// ============================================
// 管理アプリ用 (admin.html) API
// ============================================

// 顧客一覧の取得
app.get("/api/customers", (req, res) => {
  const filePath = path.join(__dirname, "customers.json");
  if (!fs.existsSync(filePath)) {
    return res.json([]);
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    res.json(data);
  } catch (e) {
    res.json([]);
  }
});

// 計算＆決済＆メール送信の実行
app.post("/api/charge", express.json(), async (req, res) => {
  try {
    const { customerId, customerName, shopName, email, calls, routes, visits, totalAmount } = req.body;

    // もし追加の成果報酬（金額）が0円より大きい場合はStripeで単発決済する
    if (totalAmount > 0) {
      // 1. InvoiceItem (請求書の項目) を追加
      await stripe.invoiceItems.create({
        customer: customerId,
        price_data: {
          currency: 'jpy',
          product_data: { name: '今月の成果報酬分 (追加請求)' },
          unit_amount: totalAmount,
        },
      });

      // 2. Invoice(請求書) を作成して即時支払いを試行
      const invoice = await stripe.invoices.create({
        customer: customerId,
        auto_advance: true,
        collection_method: 'charge_automatically',
      });

      // 3. 即時にお客様のカードから引き落とす
      await stripe.invoices.pay(invoice.id);
      console.log(`✅ [決済完了] ${shopName}様宛に ${totalAmount}円 を追加課金しました。(Invoice: ${invoice.id})`);
    } else {
      console.log(`✅ [決済なし] ${shopName}様の今月の成果報酬は0円のため、決済はスキップしました。`);
    }

    // お客様に今月の運用明細・結果をメール送信する
    if (email && process.env.GMAIL_USER) {
      const isFree = totalAmount === 0;
      const textMessage = `${shopName}
${customerName} 様

平素より「AI決済特化モデル事業」のプログラムにご参画いただき誠にありがとうございます。
株式会社adtownより、今月のGoogleビジネスプロフィールの運用成果
および【成果報酬分のご請求額】をご案内いたします。

--------------------------------------------------
■ 今月の「基準値を超えたプラスの実績」
--------------------------------------------------
・お電話からの問い合わせ増加： +${calls} 件
・経路（ルート）検索の増加　： +${routes} 件
・ウェブサイトの閲覧増加　　： +${visits} 件

--------------------------------------------------
■ 今月の「成果報酬金額」
--------------------------------------------------
¥${totalAmount.toLocaleString()}

※月額固定分(4,800円)に対する【全体上限20,000円ルール】を適用済みです。
${isFree ? "※今月は基準値を大きく上回る成果が発生しなかったため、成果報酬分の追加ご請求は【0円】となります。" : "※上記金額につきましては、ご登録済みのクレジットカードよりこのメールと同時に自動決済（引き落とし）を行わせていただきました。\n決済についての領収書は、別途Stripeより送信されるメールをご確認ください。"}

次月におきましても、引き続きAIとお客様の両方から選ばれ続ける
トップ店舗となれるよう、全力で運用サポートを行ってまいります。

ご不明な点がございましたら、本メールへご返信くださいますようお願い申し上げます。
引き続きよろしくお願いいたします。

--------------------------------------------------
株式会社adtown
〒329-2711 栃木県那須塩原市石林698-35
--------------------------------------------------`;

      const mailOptions = {
        from: `"株式会社adtown" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: `【株式会社adtown】今月のご利用明細および成果レポート`,
        text: textMessage
      };

      await transporter.sendMail(mailOptions);
      console.log(`✉️ [明細メール送信完了] ${email} へ今月の成果を送信しました`);
    }

    res.json({ success: true, message: "処理がすべて完了しました" });
  } catch (error) {
    console.error("❌ 決済またはメールエラー:", error.message);
    res.status(500).json({ error: error.message || "予期せぬエラーが発生しました" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${DOMAIN}`);
});
