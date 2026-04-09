const paymentMessage = document.getElementById("paymentMessage");
const checkoutBtn = document.getElementById("checkoutBtn");

const lead = JSON.parse(localStorage.getItem("adtownLead") || "{}");

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "未入力";
}

setText("r-name", lead.name);
setText("r-shop", lead.shop);
setText("r-email", lead.email);
setText("r-tel", lead.tel);
setText("r-industry", lead.industry);
setText("r-website", lead.website);
setText("r-message", lead.message);

checkoutBtn?.addEventListener("click", async () => {
  const consentTerms = document.getElementById("consentTerms")?.checked;
  const consentWithdraw = document.getElementById("consentWithdraw")?.checked;
  const consentStripe = document.getElementById("consentStripe")?.checked;
  const selectedPlan = document.querySelector('input[name="plan"]:checked')?.value;
  const addons = Array.from(document.querySelectorAll('input[name="addon"]:checked')).map(el => el.value);

  if (!lead.name || !lead.shop || !lead.email) {
    paymentMessage.textContent = "申込情報が見つかりません。LPから再入力してください。";
    paymentMessage.style.color = "#ff6b6b";
    return;
  }

  if (!consentTerms || !consentWithdraw || !consentStripe) {
    paymentMessage.textContent = "決済前にすべての確認項目へ同意してください。";
    paymentMessage.style.color = "#ff6b6b";
    return;
  }

  paymentMessage.textContent = "決済ページを準備しています...";
  paymentMessage.style.color = "#9fd3ff";

  try {
    const response = await fetch("https://adtown-business.onrender.com/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        plan: selectedPlan,
        addons: addons,
        customer: lead
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "決済セッションの作成に失敗しました。");
    }

    const stripe = Stripe(data.publishableKey);
    const result = await stripe.redirectToCheckout({ sessionId: data.sessionId });

    if (result.error) {
      throw new Error(result.error.message);
    }
  } catch (error) {
    paymentMessage.textContent = error.message || "決済への遷移でエラーが発生しました。";
    paymentMessage.style.color = "#ff6b6b";
  }
});
