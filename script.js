const lpForm = document.getElementById("lpForm");
const formMessage = document.getElementById("formMessage");
const industrySelect = document.getElementById("industrySelect");


if (lpForm) {
  lpForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const formData = new FormData(lpForm);
    const payload = {
      name: formData.get("name") || "",
      shop: formData.get("shop") || "",
      email: formData.get("email") || "",
      tel: formData.get("tel") || "",
      industry: formData.get("industry_select"),
      website: formData.get("website") || "",
      message: formData.get("message") || "",
      consent_case: formData.get("consent_case") ? "yes" : "no",
      consent_withdrawal: formData.get("consent_withdrawal") ? "yes" : "no"
    };

    if (!payload.name || !payload.shop || !payload.email) {
      formMessage.textContent = "必須項目を入力してください。";
      formMessage.style.color = "#ff6b6b";
      return;
    }

    if (payload.consent_case !== "yes" || payload.consent_withdrawal !== "yes") {
      formMessage.textContent = "参加条件への同意が必要です。";
      formMessage.style.color = "#ff6b6b";
      return;
    }

    localStorage.setItem("adtownLead", JSON.stringify(payload));
    window.location.href = "payment.html";
  });
}
