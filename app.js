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
  const CATEGORY_STORAGE_KEY = "kakeibo-categories-v1";
  const CATEGORY_STYLE_STORAGE_KEY = "kakeibo-category-styles-v1";
  const PAYMENT_METHOD_STORAGE_KEY = "kakeibo-payment-methods-v1";
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
  const defaultCategories = {
    expense: ["食費", "日用品", "交通費", "住居費", "趣味", "その他"],
    income: ["給与", "副業", "臨時収入", "その他"],
  };
  const defaultPaymentMethods = ["現金", "クレジットカード", "ICカード", "銀行口座"];
  let categories = loadCategories();
  let paymentMethods = loadPaymentMethods();
  const iconMap = {
    食費: ["☕", "food"], 日用品: ["▦", "daily"], 交通費: ["↗", "transport"],
    住居費: ["⌂", "home-icon"], 趣味: ["✦", "fun"], 給与: ["¥", "income-icon"],
    副業: ["¥", "income-icon"], 臨時収入: ["¥", "income-icon"], その他: ["•••", "other"],
  };
  const defaultCategoryStyles = {
    食費: { symbol: "☕", color: "#d87b32" }, 日用品: { symbol: "▦", color: "#21886d" },
    交通費: { symbol: "↗", color: "#5b6fdc" }, 住居費: { symbol: "⌂", color: "#c9703b" },
    趣味: { symbol: "✦", color: "#a55fcd" }, 給与: { symbol: "¥", color: "#2877ca" },
    副業: { symbol: "¥", color: "#2877ca" }, 臨時収入: { symbol: "¥", color: "#2877ca" },
    その他: { symbol: "•••", color: "#687386" },
  };
  let categoryStyles = loadCategoryStyles();
  const legacySampleTransactions = {
    t1: ["expense", 580, "2026-07-24", "食費", "現金", "カフェ"],
    t2: ["expense", 700, "2026-07-24", "日用品", "クレジットカード", "日用品"],
    t3: ["expense", 420, "2026-07-23", "交通費", "ICカード", "電車"],
    t4: ["income", 248000, "2026-07-23", "給与", "銀行口座", "給与"],
    t5: ["expense", 65000, "2026-07-20", "住居費", "銀行口座", "家賃"],
    t6: ["expense", 11960, "2026-07-12", "食費", "クレジットカード", "食料品"],
    t7: ["expense", 8800, "2026-07-08", "趣味", "クレジットカード", "映画と書籍"],
  };
  const yen = (value) => `¥${Math.abs(value).toLocaleString("ja-JP")}`;
  const signedYen = (value) => `${value >= 0 ? "+ " : "− "}${yen(value)}`;
  const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  let viewMonth = today().slice(0, 7);
  let currentType = "expense";
  let recurringType = "expense";
  let transactions = load();
  let recurringTransactions = [];
  let budgets = [];
  let routeStack = ["#home"];
  let isAppBack = false;
  let currentUser = null;
  let uiReady = false;
  const initialRoute = location.hash || "#home";
  if (initialRoute !== "#home") routeStack.push(initialRoute);

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(saved) ? saved.filter((entry) => !isLegacySample(entry)) : [];
    } catch {
      return [];
    }
  }
  function isLegacySample(entry) {
    const sample = legacySampleTransactions[entry.id];
    return !!sample && [
      entry.type, entry.amount, entry.date, entry.category, entry.payment, entry.memo,
    ].every((value, index) => value === sample[index]);
  }
  function loadCategories() {
    try {
      const saved = JSON.parse(localStorage.getItem(CATEGORY_STORAGE_KEY));
      return saved && Array.isArray(saved.expense) && Array.isArray(saved.income)
        ? saved
        : structuredClone(defaultCategories);
    } catch {
      return structuredClone(defaultCategories);
    }
  }
  function persistCategories() {
    localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(categories));
  }
  function loadCategoryStyles() {
    try {
      const saved = JSON.parse(localStorage.getItem(CATEGORY_STYLE_STORAGE_KEY));
      return { ...structuredClone(defaultCategoryStyles), ...(saved || {}) };
    } catch {
      return structuredClone(defaultCategoryStyles);
    }
  }
  function persistCategoryStyles() {
    localStorage.setItem(CATEGORY_STYLE_STORAGE_KEY, JSON.stringify(categoryStyles));
  }
  function loadPaymentMethods() {
    try {
      const saved = JSON.parse(localStorage.getItem(PAYMENT_METHOD_STORAGE_KEY));
      return Array.isArray(saved) && saved.length ? saved : [...defaultPaymentMethods];
    } catch {
      return [...defaultPaymentMethods];
    }
  }
  function persistPaymentMethods() {
    localStorage.setItem(PAYMENT_METHOD_STORAGE_KEY, JSON.stringify(paymentMethods));
  }
  function refreshPaymentInputs() {
    const configurations = [
      ["#payment", null],
      ["#recurring-payment", null],
      ["#filter-payment", "すべての支払い方法"],
    ];
    configurations.forEach(([selector, placeholder]) => {
      const select = document.querySelector(selector);
      const selected = select.value;
      const firstOption = placeholder ? `<option value="">${placeholder}</option>` : "";
      select.innerHTML = `${firstOption}${paymentMethods.map((name) => `<option>${escapeHtml(name)}</option>`).join("")}`;
      if ([...select.options].some((option) => option.value === selected)) select.value = selected;
    });
  }
  function categoryAppearance(name) {
    const saved = categoryStyles[name] || {};
    return {
      symbol: String(saved.symbol || iconMap[name]?.[0] || "●").slice(0, 2),
      color: /^#[0-9a-f]{6}$/i.test(saved.color || "") ? saved.color : "#687386",
    };
  }
  function categoryIconHtml(name) {
    const appearance = categoryAppearance(name);
    return `<i class="category-icon" style="color:${appearance.color};background:${appearance.color}1f">${escapeHtml(appearance.symbol)}</i>`;
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
    const remoteEntries = snapshot.docs.map(transactionFromDocument);
    const legacyDocs = snapshot.docs.filter((item, index) => isLegacySample(remoteEntries[index]));
    if (legacyDocs.length) {
      const cleanupBatch = writeBatch(db);
      legacyDocs.forEach((item) => cleanupBatch.delete(item.ref));
      await cleanupBatch.commit();
    }
    if (snapshot.empty && migrateLocal && hadLocalData && transactions.length) {
      const batch = writeBatch(db);
      transactions.forEach((entry) => {
        batch.set(doc(reference, entry.id), transactionDocument(entry));
      });
      await batch.commit();
      showToast("端末内の取引をFirebaseへ移行しました");
    } else {
      transactions = remoteEntries.filter((entry) => !isLegacySample(entry));
    }
    persist();
    if (uiReady) render();
    if (legacyDocs.length) showToast("サンプルデータを削除しました");
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
  function recurringDocument(entry) {
    return {
      type: entry.type,
      name: entry.name,
      amount: entry.amount,
      dayOfMonth: entry.dayOfMonth,
      categoryId: entry.category,
      categoryNameSnapshot: entry.category,
      paymentMethodId: entry.payment,
      paymentMethodNameSnapshot: entry.payment,
      active: entry.active,
      createdAt: Timestamp.fromMillis(Math.max(entry.createdAt || Date.now(), 1)),
      updatedAt: serverTimestamp(),
    };
  }
  function recurringFromDocument(snapshot) {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      type: data.type,
      name: data.name || data.categoryNameSnapshot || data.categoryId,
      amount: data.amount,
      dayOfMonth: data.dayOfMonth,
      category: data.categoryNameSnapshot || data.categoryId,
      payment: data.paymentMethodNameSnapshot || data.paymentMethodId,
      active: data.active !== false,
      createdAt: data.createdAt?.toMillis?.() || 0,
    };
  }
  async function loadRemoteRecurringTransactions() {
    if (!currentUser) return;
    const snapshot = await getDocs(collection(db, "users", currentUser.uid, "recurringTransactions"));
    recurringTransactions = snapshot.docs.map(recurringFromDocument);
    renderRecurringTransactions();
  }
  async function saveRemoteRecurringTransaction(entry) {
    if (!currentUser) throw new Error("ログインが必要です");
    await setDoc(doc(db, "users", currentUser.uid, "recurringTransactions", entry.id), recurringDocument(entry));
  }
  async function deleteRemoteRecurringTransaction(id) {
    if (!currentUser) throw new Error("ログインが必要です");
    await deleteDoc(doc(db, "users", currentUser.uid, "recurringTransactions", id));
  }
  function budgetReference(month, category) {
    return doc(db, "users", currentUser.uid, "budgets", month, "items", encodeURIComponent(category));
  }
  async function loadRemoteBudgets() {
    if (!currentUser) return;
    const snapshot = await getDocs(collection(db, "users", currentUser.uid, "budgets", viewMonth, "items"));
    budgets = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    if (uiReady) render();
  }
  async function saveRemoteBudget(entry) {
    if (!currentUser) throw new Error("ログインが必要です");
    await setDoc(budgetReference(viewMonth, entry.categoryId), {
      categoryId: entry.categoryId,
      amount: entry.amount,
      updatedAt: serverTimestamp(),
    });
  }
  async function deleteRemoteBudget(category) {
    if (!currentUser) throw new Error("ログインが必要です");
    await deleteDoc(budgetReference(viewMonth, category));
  }
  async function saveRemoteBudgets(entries) {
    if (!currentUser) throw new Error("ログインが必要です");
    const batch = writeBatch(db);
    entries.forEach(({ categoryId, amount }) => {
      const reference = budgetReference(viewMonth, categoryId);
      if (amount > 0) {
        batch.set(reference, { categoryId, amount, updatedAt: serverTimestamp() });
      } else {
        batch.delete(reference);
      }
    });
    await batch.commit();
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
    const sign = item.type === "income" ? "+ " : "− ";
    return `<article class="transaction" data-id="${item.id}">${categoryIconHtml(item.category)}<div><strong>${escapeHtml(item.memo || item.category)}</strong><small>${escapeHtml(item.category)} · ${escapeHtml(item.payment)}</small></div><b class="${item.type}">${sign}${yen(item.amount)}</b><button class="transaction-action" aria-label="${escapeHtml(item.memo || item.category)}を編集">•••</button></article>`;
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
    const totalBudget = budgets.reduce((total, item) => total + item.amount, 0);
    const remainingBudget = totalBudget - expense;
    homeCards[2].querySelector("strong").textContent = totalBudget ? signedYen(remainingBudget) : "未設定";
    homeCards[2].querySelector("strong").className = totalBudget ? (remainingBudget >= 0 ? "positive" : "negative") : "neutral";
    homeCards[2].querySelector("small").textContent = totalBudget ? `予算 ${yen(totalBudget)}` : "予算を設定してください";
    document.querySelectorAll(".month-label, .month-navigation span").forEach((el) => el.textContent = monthLabel(viewMonth));
    const overview = document.querySelector(".budget-overview");
    overview.querySelector(".panel-heading h2").textContent = isCurrentMonth ? "今月の予算" : "この月の予算";
    const budgetRate = totalBudget ? Math.round(expense / totalBudget * 100) : 0;
    overview.querySelector(".panel-heading p").textContent = totalBudget ? `予算 ${yen(totalBudget)}` : "まだ予算が設定されていません";
    overview.querySelector(".progress span").style.width = `${Math.min(budgetRate, 100)}%`;
    overview.querySelector(".budget-caption strong").textContent = totalBudget ? `残り ${signedYen(remainingBudget)}` : "予算を追加してください";
    overview.querySelector(".budget-caption span").textContent = totalBudget ? `${budgetRate}% 使用` : "未設定";
    const alertRow = overview.querySelector(".alert-row");
    alertRow.hidden = true;
    if (totalBudget && remainingBudget < 0) {
      alertRow.hidden = false;
      alertRow.querySelector("span:nth-child(2)").textContent = `${yen(Math.abs(remainingBudget))} 予算を超過しています`;
    }
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
    renderAnalysis();
    renderBudgets();
    bindTransactionActions();
  }
  function renderBudgets() {
    const empty = document.querySelector(".budget-empty");
    const summary = document.querySelector(".total-budget");
    const toolbar = document.querySelector(".budget-toolbar");
    const list = document.querySelector(".budget-list");
    const hasBudgets = budgets.length > 0;
    empty.hidden = hasBudgets;
    summary.hidden = !hasBudgets;
    toolbar.hidden = !hasBudgets;
    list.hidden = !hasBudgets;
    if (!hasBudgets) return;
    const monthExpenses = transactions.filter((item) => item.type === "expense" && item.date.startsWith(viewMonth));
    const total = budgets.reduce((value, item) => value + item.amount, 0);
    const used = sum(monthExpenses, "expense");
    const remaining = total - used;
    const rate = total ? Math.round(used / total * 100) : 0;
    summary.querySelector("strong").textContent = yen(total);
    summary.querySelector("small").textContent = `使用額 ${yen(used)} ／ 残額 ${signedYen(remaining)}`;
    summary.querySelector(".donut").style.background = `conic-gradient(${rate > 100 ? "var(--red)" : "var(--blue)"} ${Math.min(rate, 100)}%,#e8edf5 0)`;
    summary.querySelector(".donut span").innerHTML = `${rate}<small>%</small>`;
    document.querySelector("#budget-items").innerHTML = categories.expense.map((category) => {
      const budget = budgets.find((item) => item.categoryId === category);
      const spent = sum(monthExpenses.filter((item) => item.category === category), "expense");
      if (!budget) return `<div class="budget-item unset" data-category="${escapeHtml(category)}"><span>${categoryIconHtml(category)}${escapeHtml(category)}</span><span>予算未設定</span><strong>—</strong></div>`;
      const left = budget.amount - spent;
      const categoryRate = Math.round(spent / budget.amount * 100);
      return `<div class="budget-item${left < 0 ? " over warning" : ""}" data-category="${escapeHtml(category)}"><span>${categoryIconHtml(category)}${escapeHtml(category)}</span><span>${yen(spent)} / ${yen(budget.amount)}<i class="progress"><i style="width:${Math.min(categoryRate, 100)}%"></i></i></span><strong class="${left >= 0 ? "positive" : "negative"}">${signedYen(left)}</strong></div>`;
    }).join("");
  }
  function renderAnalysis() {
    const months = Array.from({ length: 6 }, (_, index) => offsetMonth(viewMonth, index - 5));
    const amounts = months.map((month) => sum(transactions.filter((item) => item.date.startsWith(month)), "expense"));
    const chart = document.querySelector("#expense-chart");
    if (!amounts.some(Boolean)) {
      chart.innerHTML = `<div class="empty-state"><strong>分析するデータがありません</strong>取引を記録すると、ここに支出の推移が表示されます。</div>`;
    } else {
      const max = Math.max(...amounts, 1);
      const points = amounts.map((amount, index) => `${index * 120},${175 - (amount / max) * 155}`).join(" ");
      chart.innerHTML = `<div class="line-chart"><div class="chart-y"><span>${yen(max)}</span><span>${yen(Math.round(max / 2))}</span><span>¥0</span></div><div class="chart-area"><svg viewBox="0 0 600 180" preserveAspectRatio="none" aria-label="支出推移グラフ"><polyline points="${points}" fill="none" stroke="#377aef" stroke-width="4" /></svg><div class="chart-x">${months.map((month) => `<span>${Number(month.slice(5))}月</span>`).join("")}</div></div></div>`;
    }
    const current = transactions.filter((item) => item.type === "expense" && item.date.startsWith(viewMonth));
    const previousMonth = offsetMonth(viewMonth, -1);
    const previous = transactions.filter((item) => item.type === "expense" && item.date.startsWith(previousMonth));
    const names = [...new Set([...current, ...previous].map((item) => item.category))];
    const differences = names.map((name) => ({
      name,
      value: sum(current.filter((item) => item.category === name), "expense") - sum(previous.filter((item) => item.category === name), "expense"),
    })).filter((item) => item.value !== 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const largest = Math.max(...differences.map((item) => Math.abs(item.value)), 1);
    document.querySelector(".category-compare").innerHTML = differences.length
      ? differences.map((item) => `<div><span>${escapeHtml(item.name)}</span><b class="${item.value > 0 ? "minus" : "plus"}">${signedYen(item.value)}</b><i><em style="width:${Math.round(Math.abs(item.value) / largest * 100)}%"></em></i></div>`).join("")
      : `<div class="empty-state compact-empty"><strong>比較するデータがありません</strong>今月と先月の取引が揃うと差額を表示します。</div>`;
    const previousExpense = sum(previous, "expense");
    const currentExpense = sum(current, "expense");
    const comparison = document.querySelector(".analysis-summary .summary-card small");
    comparison.textContent = previousExpense || currentExpense ? `先月より ${signedYen(currentExpense - previousExpense)}` : "前月との比較なし";
    comparison.className = currentExpense > previousExpense ? "minus" : currentExpense < previousExpense ? "plus" : "neutral";
  }
  function refreshCategoryInputs() {
    updateCategories();
    updateRecurringCategories();
    const filter = document.querySelector("#filter-category");
    const selected = filter.value;
    filter.innerHTML = `<option value="">すべてのカテゴリ</option>${[...new Set(Object.values(categories).flat())].map((name) => `<option>${escapeHtml(name)}</option>`).join("")}`;
    if ([...filter.options].some((option) => option.value === selected)) filter.value = selected;
  }
  function renderCategoryManager(type = document.querySelector("[data-category-tab].active")?.dataset.categoryTab || "expense") {
    document.querySelectorAll("[data-category-tab]").forEach((button) => button.classList.toggle("active", button.dataset.categoryTab === type));
    const list = document.querySelector("#category-list");
    list.innerHTML = categories[type].map((name, index) => {
      const appearance = categoryAppearance(name);
      const inUse = transactions.some((item) => item.type === type && item.category === name);
      return `<div class="category-row" data-name="${escapeHtml(name)}"><span class="category-row-name">${categoryIconHtml(name)}${escapeHtml(name)}</span><span class="category-style-controls"><label title="記号"><input class="category-symbol-input" maxlength="2" value="${escapeHtml(appearance.symbol)}" aria-label="${escapeHtml(name)}の記号" /></label><label title="色"><input class="category-color-input" type="color" value="${appearance.color}" aria-label="${escapeHtml(name)}の色" /></label></span><span class="category-row-actions"><button type="button" data-move="-1" ${index === 0 ? "disabled" : ""} aria-label="上へ移動">↑</button><button type="button" data-move="1" ${index === categories[type].length - 1 ? "disabled" : ""} aria-label="下へ移動">↓</button><button type="button" class="delete-category" ${inUse ? "disabled" : ""} title="${inUse ? "取引で使用中のため削除できません" : "削除"}" aria-label="削除">×</button></span></div>`;
    }).join("");
  }
  function setupCategoryManager() {
    let formType = "expense";
    document.querySelectorAll("[data-category-type]").forEach((button) => button.addEventListener("click", () => {
      formType = button.dataset.categoryType;
      document.querySelectorAll("[data-category-type]").forEach((item) => item.classList.toggle("selected", item === button));
    }));
    document.querySelectorAll("[data-category-tab]").forEach((button) => button.addEventListener("click", () => renderCategoryManager(button.dataset.categoryTab)));
    document.querySelector("#category-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.querySelector("#category-name");
      const name = input.value.trim();
      if (!name || Object.values(categories).flat().includes(name)) return showToast("同じ名前のカテゴリが既にあります");
      categories[formType].push(name);
      categoryStyles[name] = {
        symbol: document.querySelector("#category-symbol").value.trim() || "●",
        color: document.querySelector("#category-color").value,
      };
      persistCategories();
      persistCategoryStyles();
      refreshCategoryInputs();
      renderCategoryManager(formType);
      input.value = "";
      document.querySelector("#category-symbol").value = "●";
      document.querySelector("#category-color").value = "#377aef";
      updateCategoryPreview();
      showToast("カテゴリを追加しました");
    });
    document.querySelector("#category-list").addEventListener("click", (event) => {
      const row = event.target.closest(".category-row");
      if (!row) return;
      const type = document.querySelector("[data-category-tab].active").dataset.categoryTab;
      const index = categories[type].indexOf(row.dataset.name);
      if (event.target.matches("[data-move]")) {
        const target = index + Number(event.target.dataset.move);
        [categories[type][index], categories[type][target]] = [categories[type][target], categories[type][index]];
      } else if (event.target.matches(".delete-category") && confirm(`「${row.dataset.name}」を削除しますか？`)) {
        categories[type].splice(index, 1);
        delete categoryStyles[row.dataset.name];
      } else return;
      persistCategories();
      persistCategoryStyles();
      refreshCategoryInputs();
      renderCategoryManager(type);
    });
    document.querySelector("#category-list").addEventListener("change", (event) => {
      const row = event.target.closest(".category-row");
      if (!row || !event.target.matches(".category-symbol-input, .category-color-input")) return;
      const current = categoryAppearance(row.dataset.name);
      categoryStyles[row.dataset.name] = {
        symbol: row.querySelector(".category-symbol-input").value.trim() || current.symbol,
        color: row.querySelector(".category-color-input").value,
      };
      persistCategoryStyles();
      render();
      renderCategoryManager();
      showToast("カテゴリの表示を更新しました");
    });
    const updateCategoryPreview = () => {
      const symbol = document.querySelector("#category-symbol").value.trim() || "●";
      const color = document.querySelector("#category-color").value;
      const preview = document.querySelector("#category-preview-icon");
      preview.textContent = symbol;
      preview.style.color = color;
      preview.style.background = `${color}1f`;
    };
    document.querySelector("#category-symbol").addEventListener("input", updateCategoryPreview);
    document.querySelector("#category-color").addEventListener("input", updateCategoryPreview);
    updateCategoryPreview();
    renderCategoryManager();
  }
  function renderPaymentManager() {
    const list = document.querySelector("#payment-list");
    list.innerHTML = paymentMethods.map((name, index) => {
      const inUse = transactions.some((item) => item.payment === name)
        || recurringTransactions.some((item) => item.payment === name);
      return `<div class="payment-row" data-name="${escapeHtml(name)}"><strong>${escapeHtml(name)}</strong><span class="payment-row-actions"><button type="button" data-move="-1" ${index === 0 ? "disabled" : ""} aria-label="上へ移動">↑</button><button type="button" data-move="1" ${index === paymentMethods.length - 1 ? "disabled" : ""} aria-label="下へ移動">↓</button><button type="button" class="delete-payment" ${inUse || paymentMethods.length === 1 ? "disabled" : ""} title="${inUse ? "取引で使用中のため削除できません" : paymentMethods.length === 1 ? "最低1件必要です" : "削除"}" aria-label="削除">×</button></span></div>`;
    }).join("");
  }
  function setupPaymentManager() {
    document.querySelector("#payment-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.querySelector("#payment-name");
      const name = input.value.trim();
      if (!name) return;
      if (paymentMethods.includes(name)) return showToast("同じ名前の支払い方法が既にあります");
      paymentMethods.push(name);
      persistPaymentMethods();
      refreshPaymentInputs();
      renderPaymentManager();
      input.value = "";
      showToast("支払い方法を追加しました");
    });
    document.querySelector("#payment-list").addEventListener("click", (event) => {
      const row = event.target.closest(".payment-row");
      if (!row) return;
      const index = paymentMethods.indexOf(row.dataset.name);
      if (event.target.matches("[data-move]")) {
        const target = index + Number(event.target.dataset.move);
        if (target < 0 || target >= paymentMethods.length) return;
        [paymentMethods[index], paymentMethods[target]] = [paymentMethods[target], paymentMethods[index]];
      } else if (event.target.matches(".delete-payment") && confirm(`「${row.dataset.name}」を削除しますか？`)) {
        paymentMethods.splice(index, 1);
      } else return;
      persistPaymentMethods();
      refreshPaymentInputs();
      renderPaymentManager();
    });
    refreshPaymentInputs();
    renderPaymentManager();
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
  function updateRecurringCategories() {
    const select = document.querySelector("#recurring-category");
    const previous = select.value;
    select.innerHTML = `<option value="">カテゴリを選択</option>${categories[recurringType].map((name) => `<option>${escapeHtml(name)}</option>`).join("")}`;
    if (categories[recurringType].includes(previous)) select.value = previous;
    document.querySelectorAll("[data-recurring-type]").forEach((button) => {
      const active = button.dataset.recurringType === recurringType;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  function recurringHtml(item) {
    return `<article class="panel recurring-item${item.active ? "" : " is-paused"}" data-id="${item.id}">${categoryIconHtml(item.category)}<div class="recurring-summary"><strong>${escapeHtml(item.name)}</strong><small>毎月${item.dayOfMonth}日 · ${escapeHtml(item.category)} · ${escapeHtml(item.payment)}</small></div><b class="${item.type}">${item.type === "income" ? "+ " : "− "}${yen(item.amount)}</b><span class="status${item.active ? "" : " paused"}">${item.active ? "有効" : "停止中"}</span><div class="recurring-actions"><button class="recurring-menu-button" type="button" aria-label="${escapeHtml(item.name)}の操作メニュー" aria-expanded="false">•••</button><div class="recurring-menu" hidden><button type="button" data-action="edit">編集</button><button type="button" data-action="toggle">${item.active ? "一時停止" : "再開"}</button><button type="button" class="danger-menu-item" data-action="delete">削除</button></div></div></article>`;
  }
  function renderRecurringTransactions() {
    const list = document.querySelector(".recurring-list");
    const sortedItems = [...recurringTransactions].sort((a, b) => a.dayOfMonth - b.dayOfMonth || (b.createdAt || 0) - (a.createdAt || 0));
    list.innerHTML = sortedItems.length
      ? sortedItems.map(recurringHtml).join("")
      : `<article class="panel empty-state"><strong>定期取引がありません</strong>定期的な支出・収入を追加すると、ここに表示されます。</article>`;
  }
  function resetRecurringForm() {
    const form = document.querySelector("#recurring-form");
    form.reset();
    document.querySelector("#recurring-id").value = "";
    document.querySelector("#recurring-day").value = new Date().getDate();
    recurringType = "expense";
    updateRecurringCategories();
    document.querySelector("#recurring-add h1").textContent = "定期取引を追加";
    form.querySelector("button[type=submit]").textContent = "定期取引を保存";
  }
  function updateBudgetFormTotal() {
    const total = [...document.querySelectorAll(".budget-row-input")]
      .reduce((value, input) => value + (Number(input.value) || 0), 0);
    document.querySelector("#budget-form-total").textContent = yen(total);
  }
  function openBudgetForm(category = "") {
    const form = document.querySelector("#budget-form");
    form.reset();
    document.querySelector("#budget-form-items").innerHTML = categories.expense.map((name) => {
      const existing = budgets.find((item) => item.categoryId === name);
      return `<label class="budget-form-row" data-category="${escapeHtml(name)}"><span>${categoryIconHtml(name)}<strong>${escapeHtml(name)}</strong></span><span class="budget-row-amount">¥ <input class="budget-row-input" type="number" min="0" step="1" inputmode="numeric" value="${existing?.amount || ""}" placeholder="0" aria-label="${escapeHtml(name)}の予算額"></span></label>`;
    }).join("");
    document.querySelector("#budget-form-month").textContent = `${monthLabel(viewMonth)}のカテゴリ予算`;
    updateBudgetFormTotal();
    location.hash = "budget-add";
    if (category) requestAnimationFrame(() => {
      const row = [...document.querySelectorAll(".budget-form-row")].find((item) => item.dataset.category === category);
      row?.querySelector("input").focus();
    });
  }
  function setupBudgetActions() {
    document.querySelector(".budget-empty .primary-button").addEventListener("click", () => openBudgetForm());
    document.querySelector("#add-budget-button").addEventListener("click", () => openBudgetForm());
    document.querySelector("#budget-items").addEventListener("click", (event) => {
      const item = event.target.closest(".budget-item");
      if (!item) return;
      openBudgetForm(item.dataset.category || "");
    });
    document.querySelector("#budget-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const entries = [...document.querySelectorAll(".budget-form-row")].map((row) => ({
        categoryId: row.dataset.category,
        amount: Number(row.querySelector("input").value) || 0,
      }));
      if (entries.some((entry) => !Number.isInteger(entry.amount) || entry.amount < 0)) return showToast("予算額は0以上の整数で入力してください");
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      button.innerHTML = "<span aria-hidden=\"true\">▣</span> 保存中…";
      try {
        await saveRemoteBudgets(entries);
        budgets = entries.filter((entry) => entry.amount > 0);
        render();
        location.hash = "budget";
        showToast("カテゴリごとの予算を保存しました");
      } catch (error) {
        console.error(error);
        showToast("保存できませんでした。通信状態を確認してください");
      } finally {
        button.disabled = false;
        button.innerHTML = "<span aria-hidden=\"true\">▣</span> 保存する";
      }
    });
    document.querySelector("#budget-form-items").addEventListener("input", updateBudgetFormTotal);
  }
  function editRecurring(item) {
    recurringType = item.type;
    updateRecurringCategories();
    document.querySelector("#recurring-id").value = item.id;
    document.querySelector("#recurring-name").value = item.name;
    document.querySelector("#recurring-amount").value = item.amount;
    document.querySelector("#recurring-day").value = item.dayOfMonth;
    document.querySelector("#recurring-category").value = item.category;
    document.querySelector("#recurring-payment").value = item.payment;
    document.querySelector("#recurring-add h1").textContent = "定期取引を編集";
    document.querySelector("#recurring-form button[type=submit]").textContent = "変更を保存";
    location.hash = "recurring-add";
  }
  function setupRecurringActions() {
    const list = document.querySelector(".recurring-list");
    if (list.dataset.actionsReady === "true") return;
    list.dataset.actionsReady = "true";
    list.addEventListener("click", async (event) => {
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
      const entry = recurringTransactions.find((value) => value.id === item.dataset.id);
      if (!entry) return;
      closeRecurringMenus();
      if (actionButton.dataset.action === "edit") {
        editRecurring(entry);
      } else if (actionButton.dataset.action === "toggle") {
        item.classList.add("recurring-saving");
        try {
          const changed = { ...entry, active: !entry.active };
          await saveRemoteRecurringTransaction(changed);
          recurringTransactions = recurringTransactions.map((value) => value.id === entry.id ? changed : value);
          renderRecurringTransactions();
          showToast(changed.active ? "定期取引を再開しました" : "定期取引を一時停止しました");
        } catch (error) {
          console.error(error);
          item.classList.remove("recurring-saving");
          showToast("更新できませんでした。通信状態を確認してください");
        }
      } else if (actionButton.dataset.action === "delete" && confirm(`「${entry.name}」を削除しますか？`)) {
        item.classList.add("recurring-saving");
        try {
          await deleteRemoteRecurringTransaction(entry.id);
          recurringTransactions = recurringTransactions.filter((value) => value.id !== entry.id);
          renderRecurringTransactions();
          showToast("定期取引を削除しました");
        } catch (error) {
          console.error(error);
          item.classList.remove("recurring-saving");
          showToast("削除できませんでした。通信状態を確認してください");
        }
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
    document.querySelectorAll("[data-recurring-type]").forEach((button) => button.addEventListener("click", () => {
      recurringType = button.dataset.recurringType;
      updateRecurringCategories();
    }));
    document.querySelector("#add-recurring-button").addEventListener("click", resetRecurringForm);
    document.querySelector("#recurring-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = document.querySelector("#recurring-id").value;
      const amount = Number(document.querySelector("#recurring-amount").value);
      const dayOfMonth = Number(document.querySelector("#recurring-day").value);
      const name = document.querySelector("#recurring-name").value.trim();
      const category = document.querySelector("#recurring-category").value;
      if (!name || !Number.isInteger(amount) || amount < 1 || !Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31 || !category) {
        showToast("入力内容を確認してください");
        return;
      }
      const previous = recurringTransactions.find((item) => item.id === id);
      const entry = {
        id: id || crypto.randomUUID(),
        type: recurringType,
        name,
        amount,
        dayOfMonth,
        category,
        payment: document.querySelector("#recurring-payment").value,
        active: previous?.active ?? true,
        createdAt: previous?.createdAt || Date.now(),
      };
      const submitButton = event.currentTarget.querySelector("button[type=submit]");
      submitButton.disabled = true;
      submitButton.textContent = "保存中…";
      try {
        await saveRemoteRecurringTransaction(entry);
        recurringTransactions = id
          ? recurringTransactions.map((item) => item.id === id ? entry : item)
          : [...recurringTransactions, entry];
        renderRecurringTransactions();
        resetRecurringForm();
        location.hash = "recurring";
        showToast(id ? "定期取引を更新しました" : "定期取引を追加しました");
      } catch (error) {
        console.error(error);
        showToast("保存できませんでした。通信状態を確認してください");
      } finally {
        submitButton.disabled = false;
        if (document.querySelector("#recurring-id").value) submitButton.textContent = "変更を保存";
      }
    });
    updateRecurringCategories();
    renderRecurringTransactions();
  }
  function setup() {
    document.querySelector("#date").value = today();
    updateCategories();
    const months = [...new Set(["2026-07", today().slice(0, 7), ...transactions.map((item) => item.date.slice(0, 7))])].sort().reverse();
    document.querySelector("#filter-month").innerHTML = months.map((month) => `<option value="${month}">${monthLabel(month)}</option>`).join("");
    document.querySelector("#filter-month").value = viewMonth;
    refreshCategoryInputs();
    setupCategoryManager();
    setupPaymentManager();
    setupBudgetActions();
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
      navigation.querySelectorAll("button").forEach((button, index) => button.addEventListener("click", async () => {
        const [year, month] = viewMonth.split("-").map(Number);
        const next = new Date(year, month - 1 + (index === 0 ? -1 : 1), 1);
        viewMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
        try {
          await loadRemoteBudgets();
        } catch (error) {
          console.error(error);
          budgets = [];
          showToast("予算を読み込めませんでした");
        }
        render();
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }));
    });
    document.querySelectorAll('a[href="#add"]').forEach((link) => link.addEventListener("click", resetForm));
    document.querySelector(".icon-button").addEventListener("click", async (event) => {
      event.currentTarget.classList.add("syncing");
      try {
        await Promise.all([loadRemoteTransactions(), loadRemoteBudgets()]);
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
        await Promise.all([loadRemoteTransactions(), loadRemoteBudgets()]);
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
      await loadRemoteRecurringTransactions();
      await loadRemoteBudgets();
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
