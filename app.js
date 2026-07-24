import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

(() => {
  "use strict";

  const STORAGE_KEY = "kakeibo-transactions-v1";
  const firebaseConfig = {
    projectId: "ka-kei-bo",
    appId: "1:1026729282840:web:91c6cb379382a0b953e26d",
    storageBucket: "ka-kei-bo.firebasestorage.app",
    apiKey: "AIzaSyB1eL41rK34NwPLMnaHt5RGwqbAM7FikYM",
    authDomain: "ka-kei-bo.firebaseapp.com",
    messagingSenderId: "1026729282840",
    measurementId: "G-RPBLQ4C6E8",
  };
  const firebaseApp = initializeApp(firebaseConfig);
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);
  const googleProvider = new GoogleAuthProvider();
  const hadLocalData = localStorage.getItem(STORAGE_KEY) !== null;
  const categories = {
    expense: ["食費", "日用品", "交通費", "住居費", "趣味", "その他"],
    income: ["給与", "副業", "臨時収入", "その他"],
  };
  const iconMap = {
    食費: ["☕", "food"], 日用品: ["▦", "daily"], 交通費: ["↗", "transport"],
    住居費: ["⌂", "home-icon"], 趣味: ["✦", "fun"], 給与: ["¥", "income-icon"],
    副業: ["¥", "income-icon"], 臨時収入: ["¥", "income-icon"], その他: ["•••", "other"],
  };
  const seed = [
    { id: "t1", type: "expense", amount: 580, date: "2026-07-24", category: "食費", payment: "現金", memo: "カフェ", createdAt: 4 },
    { id: "t2", type: "expense", amount: 700, date: "2026-07-24", category: "日用品", payment: "クレジットカード", memo: "日用品", createdAt: 3 },
    { id: "t3", type: "expense", amount: 420, date: "2026-07-23", category: "交通費", payment: "ICカード", memo: "電車", createdAt: 2 },
    { id: "t4", type: "income", amount: 248000, date: "2026-07-23", category: "給与", payment: "銀行口座", memo: "給与", createdAt: 1 },
    { id: "t5", type: "expense", amount: 65000, date: "2026-07-20", category: "住居費", payment: "銀行口座", memo: "家賃", createdAt: 0 },
    { id: "t6", type: "expense", amount: 11960, date: "2026-07-12", category: "食費", payment: "クレジットカード", memo: "食料品", createdAt: -1 },
    { id: "t7", type: "expense", amount: 8800, date: "2026-07-08", category: "趣味", payment: "クレジットカード", memo: "映画と書籍", createdAt: -2 },
  ];
  const yen = (value) => `¥${Math.abs(value).toLocaleString("ja-JP")}`;
  const signedYen = (value) => `${value >= 0 ? "+ " : "− "}${yen(value)}`;
  const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  let viewMonth = "2026-07";
  let currentType = "expense";
  let transactions = load();
  let routeStack = ["#home"];
  let isAppBack = false;
  let currentUser = null;
  let uiReady = false;
  const initialRoute = location.hash || "#home";
  if (initialRoute !== "#home") routeStack.push(initialRoute);

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(saved) ? saved : seed;
    } catch {
      return seed;
    }
  }
  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }
  function transactionDocument(entry) {
    return {
      type: entry.type,
      amount: entry.amount,
      date: entry.date,
      categoryId: entry.category,
      categoryNameSnapshot: entry.category,
      paymentMethodId: entry.payment,
      paymentMethodNameSnapshot: entry.payment,
      memo: entry.memo || "",
      recurringTransactionId: null,
      recurringPeriod: null,
      createdAt: Timestamp.fromMillis(Math.max(entry.createdAt || Date.now(), 1)),
      updatedAt: serverTimestamp(),
    };
  }
  function transactionFromDocument(snapshot) {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      type: data.type,
      amount: data.amount,
      date: data.date,
      category: data.categoryNameSnapshot || data.categoryId,
      payment: data.paymentMethodNameSnapshot || data.paymentMethodId,
      memo: data.memo || "",
      createdAt: data.createdAt?.toMillis?.() || 0,
    };
  }
  async function loadRemoteTransactions({ migrateLocal = false } = {}) {
    if (!currentUser) return;
    const reference = collection(db, "users", currentUser.uid, "transactions");
    const snapshot = await getDocs(reference);
    if (snapshot.empty && migrateLocal && hadLocalData && transactions.length) {
      const batch = writeBatch(db);
      transactions.forEach((entry) => {
        batch.set(doc(reference, entry.id), transactionDocument(entry));
      });
      await batch.commit();
      showToast("端末内の取引をFirebaseへ移行しました");
    } else {
      transactions = snapshot.docs.map(transactionFromDocument);
    }
    persist();
    if (uiReady) render();
    document.querySelector("#sync-status").textContent = `最終同期：${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`;
  }
  async function saveRemoteTransaction(entry) {
    if (!currentUser) throw new Error("ログインが必要です");
    await setDoc(doc(db, "users", currentUser.uid, "transactions", entry.id), transactionDocument(entry));
  }
  async function deleteRemoteTransaction(id) {
    if (!currentUser) throw new Error("ログインが必要です");
    await deleteDoc(doc(db, "users", currentUser.uid, "transactions", id));
  }
  function monthLabel(month) {
    const [year, value] = month.split("-");
    return `${year}年 ${Number(value)}月`;
  }
  function offsetMonth(month, amount) {
    const [year, value] = month.split("-").map(Number);
    const date = new Date(year, value - 1 + amount, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
  }
  function sorted(list = transactions) {
    return [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  }
  function sum(list, type) {
    return list.filter((item) => item.type === type).reduce((total, item) => total + item.amount, 0);
  }
  function showToast(message) {
    const toast = document.querySelector(".toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
  }
  function updateCategories() {
    const select = document.querySelector("#category");
    const previous = select.value;
    select.innerHTML = `<option value="">カテゴリを選択</option>${categories[currentType].map((name) => `<option>${name}</option>`).join("")}`;
    if (categories[currentType].includes(previous)) select.value = previous;
    document.querySelectorAll(".type-switch button").forEach((button) => {
      const active = button.dataset.type === currentType;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  function transactionHtml(item) {
    const [icon, className] = iconMap[item.category] || iconMap["その他"];
    const sign = item.type === "income" ? "+ " : "− ";
    return `<article class="transaction" data-id="${item.id}"><span class="category-icon ${className}">${icon}</span><div><strong>${escapeHtml(item.memo || item.category)}</strong><small>${escapeHtml(item.category)} · ${escapeHtml(item.payment)}</small></div><b class="${item.type}">${sign}${yen(item.amount)}</b><button class="transaction-action" aria-label="${escapeHtml(item.memo || item.category)}を編集">•••</button></article>`;
  }
  function dateHeading(date, list, compact = false) {
    const parsed = new Date(`${date}T00:00:00`);
    const label = date === today() ? "今日" : `${parsed.getMonth() + 1}月${parsed.getDate()}日（${"日月火水木金土"[parsed.getDay()]}）`;
    if (compact) return `<div class="date-row"><span>${label}</span></div>`;
    const expense = sum(list, "expense");
    const income = sum(list, "income");
    const detail = [income ? `収入 ${yen(income)}` : "", expense ? `支出 ${yen(expense)}` : ""].filter(Boolean).join(" · ");
    return `<div class="date-row"><span>${label}</span><small>${detail}</small></div>`;
  }
  function timelineHtml(list, limit, compact = false) {
    const chosen = sorted(list).slice(0, limit || list.length);
    if (!chosen.length) return `<div class="empty-state"><strong>取引がありません</strong>条件を変えるか、新しい取引を記録してください。</div>`;
    const groups = Object.groupBy ? Object.groupBy(chosen, (item) => item.date) : chosen.reduce((all, item) => ((all[item.date] ||= []).push(item), all), {});
    return Object.entries(groups).map(([date, items]) => dateHeading(date, items, compact) + items.map(transactionHtml).join("")).join("");
  }
  function render() {
    const monthItems = transactions.filter((item) => item.date.startsWith(viewMonth));
    const currentMonth = today().slice(0, 7);
    const isCurrentMonth = viewMonth === currentMonth;
    const isFutureMonth = viewMonth > currentMonth;
    const expense = sum(monthItems, "expense");
    const previousExpense = sum(transactions.filter((item) => item.date.startsWith(offsetMonth(viewMonth, -1))), "expense");
    const expenseDifference = expense - previousExpense;
    const income = sum(monthItems, "income");
    const balance = income - expense;
    const budget = 120000;
    const remaining = budget - expense;
    const todayItems = transactions.filter((item) => item.date === today());
    const todayExpense = sum(todayItems, "expense");
    const homeCards = document.querySelectorAll("#home .summary-card");
    homeCards[0].hidden = !isCurrentMonth;
    document.querySelector("#home .summary-grid").classList.toggle("without-today", !isCurrentMonth);
    homeCards[0].querySelector("strong").textContent = yen(todayExpense);
    homeCards[0].querySelector("small").textContent = `${todayItems.length}件の取引`;
    homeCards[1].querySelector("p").textContent = isCurrentMonth ? "今月の支出" : "この月の支出";
    homeCards[1].querySelector("strong").textContent = yen(expense);
    const comparison = homeCards[1].querySelector("small");
    comparison.textContent = isFutureMonth
      ? "まだ取引はありません"
      : expenseDifference === 0
        ? "前月と同じ"
        : `前月より ${yen(expenseDifference)} ${expenseDifference > 0 ? "多い" : "少ない"}`;
    comparison.className = isFutureMonth ? "neutral" : expenseDifference > 0 ? "minus" : expenseDifference < 0 ? "plus" : "neutral";
    homeCards[2].querySelector("strong").textContent = isFutureMonth ? "未設定" : signedYen(remaining);
    homeCards[2].querySelector("strong").className = isFutureMonth ? "neutral" : remaining >= 0 ? "positive" : "negative";
    homeCards[2].querySelector("small").textContent = isFutureMonth ? "この月の予算を追加してください" : `予算 ${yen(budget)} のうち`;
    document.querySelectorAll(".month-label, .month-navigation span").forEach((el) => el.textContent = monthLabel(viewMonth));
    const overview = document.querySelector(".budget-overview");
    overview.querySelector(".panel-heading h2").textContent = isCurrentMonth ? "今月の予算" : "この月の予算";
    overview.querySelector(".panel-heading p").textContent = isFutureMonth ? "まだ予算が設定されていません" : `${yen(expense)} / ${yen(budget)}`;
    const rate = Math.round((expense / budget) * 100);
    overview.querySelector(".progress span").style.width = isFutureMonth ? "0%" : `${Math.min(rate, 100)}%`;
    overview.querySelector(".budget-caption strong").textContent = isFutureMonth ? "予算を追加してください" : remaining >= 0 ? `残り ${yen(remaining)}` : `${yen(-remaining)} 超過`;
    overview.querySelector(".budget-caption span").textContent = isFutureMonth ? "未設定" : `${rate}% 使用`;
    const categoryBudgets = { 食費: 30000, 交通費: 10000, 日用品: 15000, 趣味: 12000 };
    const warning = Object.entries(categoryBudgets)
      .map(([category, amount]) => ({
        category,
        rate: Math.round((sum(monthItems.filter((item) => item.category === category), "expense") / amount) * 100),
      }))
      .filter((item) => item.rate >= 80)
      .sort((a, b) => b.rate - a.rate)[0];
    const alertRow = overview.querySelector(".alert-row");
    alertRow.hidden = isFutureMonth || !warning;
    if (warning) alertRow.querySelector("span:nth-child(2)").textContent = `${warning.category}が予算の ${warning.rate}% に達しています`;
    document.querySelector(".budget-set-content").hidden = isFutureMonth;
    document.querySelector(".budget-empty").hidden = !isFutureMonth;
    const flow = document.querySelectorAll(".flow-numbers b");
    flow[0].textContent = `+ ${yen(income)}`;
    flow[1].textContent = `− ${yen(expense)}`;
    flow[2].textContent = signedYen(balance);
    flow[2].className = balance >= 0 ? "income" : "expense";
    document.querySelector("#home .timeline").innerHTML = timelineHtml(monthItems, 6, true);
    renderTransactions();
    document.querySelectorAll(".analysis-summary .summary-card strong").forEach((el, index) => {
      const values = [expense, income, balance];
      el.textContent = index === 2 ? signedYen(values[index]) : yen(values[index]);
    });
    bindTransactionActions();
  }
  function renderTransactions() {
    const month = document.querySelector("#filter-month").value || viewMonth;
    const category = document.querySelector("#filter-category").value;
    const payment = document.querySelector("#filter-payment").value;
    const query = document.querySelector("#filter-search").value.trim().toLowerCase();
    const filtered = transactions.filter((item) =>
      item.date.startsWith(month) && (!category || item.category === category) &&
      (!payment || item.payment === payment) && (!query || `${item.memo} ${item.category}`.toLowerCase().includes(query))
    );
    document.querySelector(".all-transactions").innerHTML = timelineHtml(filtered);
    bindTransactionActions();
  }
  function bindTransactionActions() {
    document.querySelectorAll(".transaction-action").forEach((button) => {
      button.onclick = async () => {
        const id = button.closest(".transaction").dataset.id;
        const item = transactions.find((entry) => entry.id === id);
        if (!item) return;
        if (confirm(`「${item.memo || item.category}」を編集しますか？\nキャンセルすると削除を選べます。`)) {
          edit(item);
        } else if (confirm(`この取引を削除しますか？\n${item.type === "expense" ? "支出" : "収入"} ${yen(item.amount)}`)) {
          button.disabled = true;
          try {
            await deleteRemoteTransaction(id);
            transactions = transactions.filter((entry) => entry.id !== id);
            persist();
            render();
            showToast("取引を削除しました");
          } catch (error) {
            console.error(error);
            button.disabled = false;
            showToast("削除できませんでした。通信状態を確認してください");
          }
        }
      };
    });
  }
  function edit(item) {
    currentType = item.type;
    updateCategories();
    document.querySelector("#transaction-id").value = item.id;
    document.querySelector("#amount").value = item.amount;
    document.querySelector("#category").value = item.category;
    document.querySelector("#date").value = item.date;
    document.querySelector("#payment").value = item.payment;
    document.querySelector("#memo").value = item.memo;
    document.querySelector("#add h1").textContent = "取引を編集";
    document.querySelector("#transaction-form button[type=submit]").textContent = "変更を保存";
    location.hash = "add";
  }
  function resetForm() {
    const form = document.querySelector("#transaction-form");
    form.reset();
    document.querySelector("#transaction-id").value = "";
    document.querySelector("#date").value = today();
    document.querySelector("#amount").value = "";
    currentType = "expense";
    updateCategories();
    document.querySelector("#add h1").textContent = "取引を記録";
    form.querySelector("button[type=submit]").textContent = "記録を保存";
  }
  function closeRecurringMenus(except = null) {
    document.querySelectorAll(".recurring-menu-button").forEach((button) => {
      if (button === except) return;
      button.setAttribute("aria-expanded", "false");
      button.nextElementSibling.hidden = true;
    });
  }
  function setupRecurringActions() {
    const list = document.querySelector(".recurring-list");
    if (list.dataset.actionsReady === "true") return;
    list.dataset.actionsReady = "true";
    list.addEventListener("click", (event) => {
      const menuButton = event.target.closest(".recurring-menu-button");
      if (menuButton) {
        const willOpen = menuButton.getAttribute("aria-expanded") !== "true";
        closeRecurringMenus(menuButton);
        menuButton.setAttribute("aria-expanded", String(willOpen));
        menuButton.nextElementSibling.hidden = !willOpen;
        if (willOpen) menuButton.nextElementSibling.querySelector("button").focus();
        return;
      }
      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;
      const item = actionButton.closest(".recurring-item");
      const nameElement = item.querySelector(".recurring-summary strong");
      const status = item.querySelector(".status");
      closeRecurringMenus();
      if (actionButton.dataset.action === "edit") {
        const nextName = prompt("定期取引名を編集", nameElement.textContent);
        if (nextName?.trim()) {
          nameElement.textContent = nextName.trim();
          item.querySelector(".recurring-menu-button").setAttribute("aria-label", `${nextName.trim()}の操作メニュー`);
          showToast("定期取引を更新しました");
        }
      } else if (actionButton.dataset.action === "toggle") {
        const paused = status.textContent === "有効";
        status.textContent = paused ? "停止中" : "有効";
        status.classList.toggle("paused", paused);
        item.classList.toggle("is-paused", paused);
        actionButton.textContent = paused ? "再開" : "一時停止";
        showToast(paused ? "定期取引を一時停止しました" : "定期取引を再開しました");
      } else if (actionButton.dataset.action === "delete" && confirm(`「${nameElement.textContent}」を削除しますか？`)) {
        item.remove();
        showToast("定期取引を削除しました");
      }
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".recurring-actions")) closeRecurringMenus();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const openButton = document.querySelector('.recurring-menu-button[aria-expanded="true"]');
      closeRecurringMenus();
      openButton?.focus();
    });
  }
  function setup() {
    document.querySelector("#date").value = today();
    updateCategories();
    const months = [...new Set(["2026-07", today().slice(0, 7), ...transactions.map((item) => item.date.slice(0, 7))])].sort().reverse();
    document.querySelector("#filter-month").innerHTML = months.map((month) => `<option value="${month}">${monthLabel(month)}</option>`).join("");
    document.querySelector("#filter-month").value = viewMonth;
    document.querySelector("#filter-category").innerHTML += [...new Set(Object.values(categories).flat())].map((name) => `<option>${name}</option>`).join("");
    document.querySelectorAll(".type-switch button").forEach((button) => button.addEventListener("click", () => {
      currentType = button.dataset.type;
      updateCategories();
    }));
    document.querySelector("#transaction-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const amount = Number(document.querySelector("#amount").value);
      const category = document.querySelector("#category").value;
      if (!Number.isInteger(amount) || amount < 1 || !category) {
        showToast("金額とカテゴリを確認してください");
        return;
      }
      const id = document.querySelector("#transaction-id").value;
      const entry = {
        id: id || crypto.randomUUID(), type: currentType, amount,
        date: document.querySelector("#date").value, category,
        payment: document.querySelector("#payment").value,
        memo: document.querySelector("#memo").value.trim(),
        createdAt: id ? transactions.find((item) => item.id === id)?.createdAt : Date.now(),
      };
      const submitButton = event.currentTarget.querySelector("button[type=submit]");
      submitButton.disabled = true;
      submitButton.textContent = "保存中…";
      try {
        await saveRemoteTransaction(entry);
        transactions = id ? transactions.map((item) => item.id === id ? entry : item) : [...transactions, entry];
        persist();
        viewMonth = entry.date.slice(0, 7);
        document.querySelector("#filter-month").value = viewMonth;
        render();
        resetForm();
        location.hash = "home";
        showToast(id ? "取引を更新しました" : "取引を保存しました");
      } catch (error) {
        console.error(error);
        showToast("保存できませんでした。通信状態を確認してください");
      } finally {
        submitButton.disabled = false;
        if (document.querySelector("#transaction-id").value) submitButton.textContent = "変更を保存";
      }
    });
    ["filter-month", "filter-category", "filter-payment"].forEach((id) => document.querySelector(`#${id}`).addEventListener("change", renderTransactions));
    document.querySelector("#filter-search").addEventListener("input", renderTransactions);
    document.querySelector("#clear-filters").addEventListener("click", () => {
      document.querySelector("#filter-category").value = "";
      document.querySelector("#filter-payment").value = "";
      document.querySelector("#filter-search").value = "";
      renderTransactions();
    });
    document.querySelectorAll(".month-navigation").forEach((navigation) => {
      navigation.querySelectorAll("button").forEach((button, index) => button.addEventListener("click", () => {
        const [year, month] = viewMonth.split("-").map(Number);
        const next = new Date(year, month - 1 + (index === 0 ? -1 : 1), 1);
        viewMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
        render();
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }));
    });
    document.querySelectorAll('a[href="#add"]').forEach((link) => link.addEventListener("click", resetForm));
    document.querySelector(".icon-button").addEventListener("click", async (event) => {
      event.currentTarget.classList.add("syncing");
      try {
        await loadRemoteTransactions();
        showToast("最新のデータに同期しました");
      } catch (error) {
        console.error(error);
        showToast("同期できませんでした。通信状態を確認してください");
      } finally {
        event.currentTarget.classList.remove("syncing");
      }
    });
    document.querySelector("#sync-now").addEventListener("click", async (event) => {
      event.currentTarget.disabled = true;
      event.currentTarget.textContent = "同期中…";
      try {
        await loadRemoteTransactions();
        showToast("最新のデータに同期しました");
      } catch (error) {
        console.error(error);
        showToast("同期できませんでした");
      } finally {
        event.currentTarget.disabled = false;
        event.currentTarget.textContent = "今すぐ同期";
      }
    });
    document.querySelector("#logout").addEventListener("click", async () => {
      if (!confirm("ログアウトしますか？")) return;
      await signOut(auth);
      location.hash = "home";
    });
    const backButton = document.querySelector(".global-back");
    const updateBackButton = () => {
      backButton.hidden = (location.hash || "#home") === "#home";
      backButton.disabled = routeStack.length < 2;
    };
    backButton.addEventListener("click", () => {
      if (routeStack.length < 2) return;
      routeStack.pop();
      isAppBack = true;
      location.hash = routeStack.at(-1);
    });
    window.addEventListener("hashchange", () => {
      const target = location.hash || "#home";
      if (isAppBack) {
        isAppBack = false;
      } else if (routeStack.at(-1) !== target) {
        routeStack.push(target);
      }
      document.querySelectorAll(".nav-item, .mobile-nav a").forEach((link) => link.classList.toggle("active", link.getAttribute("href") === target));
      updateBackButton();
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    document.querySelector(".budget-empty .primary-button").addEventListener("click", () => {
      showToast(`${monthLabel(viewMonth)}の予算設定を開始します`);
    });
    render();
    uiReady = true;
    updateBackButton();
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }
  async function showSignedInApp(user) {
    currentUser = user;
    const displayName = user.displayName || "ユーザー";
    const initial = displayName.slice(0, 1).toUpperCase();
    document.querySelector(".account .avatar").textContent = initial;
    document.querySelector(".account strong").textContent = displayName;
    document.querySelector(".account small").textContent = user.email || "Googleアカウント";
    document.querySelector("#account-email").textContent = user.email || "Googleアカウントでログイン中です。";
    document.querySelector("#home h1").textContent = `おかえりなさい、${displayName}さん`;
    document.querySelector("#auth-screen").hidden = true;
    document.querySelector("#app-shell").hidden = false;
    document.querySelector("#mobile-nav").hidden = false;
    try {
      await setDoc(doc(db, "users", user.uid), {
        displayName,
        email: user.email || "",
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await loadRemoteTransactions({ migrateLocal: true });
    } catch (error) {
      console.error(error);
      transactions = hadLocalData ? load() : [];
      document.querySelector("#sync-status").textContent = "未同期：通信状態を確認してください";
      showToast("Firebaseに接続できないため、端末内データを表示します");
    }
    if (!uiReady) setup();
    else render();
  }
  function showSignedOutApp() {
    currentUser = null;
    document.querySelector("#app-shell").hidden = true;
    document.querySelector("#mobile-nav").hidden = true;
    document.querySelector("#auth-screen").hidden = false;
    const loginButton = document.querySelector("#google-login");
    loginButton.disabled = false;
    document.querySelector("#login-status").textContent = "Googleアカウントでログインしてください";
  }
  async function bootAuthentication() {
    setupRecurringActions();
    const loginButton = document.querySelector("#google-login");
    const loginStatus = document.querySelector("#login-status");
    loginButton.addEventListener("click", async () => {
      loginButton.disabled = true;
      loginStatus.className = "login-status";
      loginStatus.textContent = "Googleログインを開いています…";
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (error) {
        console.error(error);
        loginButton.disabled = false;
        loginStatus.className = "login-status error";
        loginStatus.textContent = error.code === "auth/popup-closed-by-user"
          ? "ログインがキャンセルされました"
          : "ログインできませんでした。Firebaseの認証設定を確認してください";
      }
    });
    try {
      await setPersistence(auth, browserLocalPersistence);
      onAuthStateChanged(auth, (user) => {
        if (user) showSignedInApp(user);
        else showSignedOutApp();
      });
    } catch (error) {
      console.error(error);
      loginStatus.className = "login-status error";
      loginStatus.textContent = "Firebaseを初期化できませんでした";
    }
  }
  bootAuthentication();
})();
