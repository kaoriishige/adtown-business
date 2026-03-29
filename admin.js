document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('customerList');

  try {
    // サーバーからお客様一覧を取得
    const res = await fetch("/api/customers");
    const customers = await res.json();

    if (!customers || customers.length === 0) {
      container.innerHTML = "<p>まだ登録されているお客様がいません。</p>";
      return;
    }

    container.innerHTML = ""; // クリア

    customers.reverse().forEach((cust, index) => {
      // お客様ごとにカードを生成
      if (!cust.customerId) return; // Stripe顧客IDがない人はスキップ

      const card = document.createElement('div');
      card.className = "customer-card";
      
      const formId = `form-${index}`;

      card.innerHTML = `
        <div class="customer-header">
          <div class="customer-info">
            <strong>${cust.shop}</strong>
            <span>代表: ${cust.name} 様 | 顧客ID: ${cust.customerId}</span>
            <span style="display:block; margin-top:4px;">登録日: ${cust.date}</span>
          </div>
        </div>

        <form id="${formId}">
          <div class="calc-row">
            <div>
              <label>📞 電話増加件数 (500円/件)</label>
              <input type="number" id="calls-${index}" value="0" min="0">
            </div>
            <div>
              <label>🗺️ ルート増加件数 (300円/件)</label>
              <input type="number" id="routes-${index}" value="0" min="0">
            </div>
            <div>
              <label>🌐 サイト閲覧増加数 (200円/件)</label>
              <input type="number" id="visits-${index}" value="0" min="0">
            </div>
          </div>

          <div class="calc-result">
            <div>
              <span class="label">今回請求する成果報酬額（上限ルール適応済み）</span>
              <span class="price" id="total-${index}">¥0</span>
            </div>
            <button type="button" class="btn btn-primary" id="btn-${index}">計算＆請求を実行する</button>
          </div>
          <p id="msg-${index}" style="margin:0; font-size:13px;"></p>
        </form>
      `;
      container.appendChild(card);

      // 計算ロジックの設定
      const inputCalls = document.getElementById(`calls-${index}`);
      const inputRoutes = document.getElementById(`routes-${index}`);
      const inputVisits = document.getElementById(`visits-${index}`);
      const elTotal = document.getElementById(`total-${index}`);
      const btnCharge = document.getElementById(`btn-${index}`);
      const msgText = document.getElementById(`msg-${index}`);

      const MAX_REWARD = 20000 - 4800; // 全体上限2万 - 基本月額4800 = 成果報酬部分の上限は15,200円

      function calculateReward() {
        const calls = parseInt(inputCalls.value) || 0;
        const routes = parseInt(inputRoutes.value) || 0;
        const visits = parseInt(inputVisits.value) || 0;

        let rawTotal = (calls * 500) + (routes * 300) + (visits * 200);
        
        // 上限15,200円で頭打ちパース
        let finalTotal = rawTotal > MAX_REWARD ? MAX_REWARD : rawTotal;

        elTotal.textContent = `¥${finalTotal.toLocaleString()}`;
        return finalTotal;
      }

      // 入力時に自動計算
      inputCalls.addEventListener('input', calculateReward);
      inputRoutes.addEventListener('input', calculateReward);
      inputVisits.addEventListener('input', calculateReward);

      // 課金実行ボタン
      btnCharge.addEventListener('click', async () => {
        const confirmMsg = "本当にこの金額をStripeで引き落とし、お客様に明細メールを送信しますか？";
        if (!confirm(confirmMsg)) return;

        const calls = parseInt(inputCalls.value) || 0;
        const routes = parseInt(inputRoutes.value) || 0;
        const visits = parseInt(inputVisits.value) || 0;
        const totalAmount = calculateReward();

        card.classList.add("loading");
        msgText.textContent = "処理中... (このままお待ち下さい)";
        msgText.style.color = "#87e8ff";

        try {
          const payload = {
            customerId: cust.customerId,
            customerName: cust.name,
            shopName: cust.shop,
            email: cust.email,
            calls, routes, visits, totalAmount
          };

          const response = await fetch("/api/charge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || "決済に失敗しました");
          }

          msgText.textContent = "✅ 決済完了！お客様に明細メールを送信しました。";
          msgText.style.color = "#38d39f";
          btnCharge.style.display = "none"; // 2重押し防止

        } catch (err) {
          msgText.textContent = `❌ エラー: ${err.message}`;
          msgText.style.color = "#ff5d5d";
        } finally {
          card.classList.remove("loading");
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<p style="color:red;">データの読み込みに失敗しました (${err.message})</p>`;
  }
});
