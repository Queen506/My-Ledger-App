import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, writeBatch } 
from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// 2. --- CONFIG ---
const firebaseConfig = {
      apiKey: "AIzaSyBouqA5x3XiOISRx0z0cq4mCOV_UwnvQtY",
  authDomain: "ledger-app-83f7b.firebaseapp.com",
  projectId: "ledger-app-83f7b",
  storageBucket: "ledger-app-83f7b.firebasestorage.app",
  messagingSenderId: "249709513932",
  appId: "1:249709513932:web:d91d53b97c3a01f4ea0669",
  measurementId: "G-BETC3RMGQW"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- 2. DATA ---
const categories = {
    expense: ['Groceries', 'Rentals', 'Insurance', 'Utilities', 'Health', 'Transportation','Education', 'Parents', 'Shopping', 'Gift', 'Game'],
    income: ['Salary', 'Freelance', 'Income', 'ยอดยกมา/ปรับยอด'],
    savings: ['Savings', 'Stocks', 'Crypto', 'Mutual Funds'],
    refund: [],
    transfer: ['โอนเงิน/ย้ายเงิน']
};
categories.refund = [...categories.expense];
const bucketMap = {
    needs: ['Groceries', 'Rentals', 'Insurance', 'Utilities', 'Transportation', 'Education', 'Health', 'Parents' ],
    wants: [ 'Shopping', 'Gift', 'Game']
};

const WALLET_LABELS = {
    'Kplus': 'Kplus',
    'TrueMoney': 'TrueMoney',
    'ShopeePay': 'ShopeePay',
    'Paotang': 'เป๋าตัง',
    'KrungsriNext': 'KrungsriNext',
    'ttb': 'ttb',
    'CreditCard': 'บัตรเครดิต',
    'Cash': 'เงินสด',
    'tsb': 'tsb',
    'KKP': 'KKP'
};

let allTransactions = [];
let allSubscriptions = [];
let allBudgets = {};
let charts = {};
let currentBudget = { type: 'fixed', value: 0 };
let currentWalletBalances = {};

window.formatNumberShort = function(num) {
    return parseFloat(num).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2});
}
window.formatMoney = function(num) {
    return parseFloat(num).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2});
}

function todayString() {
    const t = new Date();
    return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, '0') + "-" + String(t.getDate()).padStart(2, '0');
}

// --- 3. CORE FIREBASE FUNCTIONS ---
async function loadData() {
    try {
        const txSnapshot = await getDocs(collection(db, "transactions"));
        allTransactions = txSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const subSnapshot = await getDocs(collection(db, "subscriptions"));
        allSubscriptions = subSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const budSnapshot = await getDocs(collection(db, "budgets"));
        allBudgets = {};
        budSnapshot.docs.forEach(doc => {
            allBudgets[doc.id] = doc.data();
        });

        // หมวดหมู่ที่ผู้ใช้ตั้งเอง (เก็บไว้ใน budgets/config-categories)
        if (allBudgets['config-categories']) {
            applyCategoryConfig(allBudgets['config-categories']);
            delete allBudgets['config-categories'];
            refreshCategoryDropdowns();
        }
        rebuildSearchCategoryFilter();

        document.getElementById('global-loading').style.display = 'none';
        updateDashboardUI();
        updateSearchUI();
        renderSubscriptions();
    } catch (error) {
        document.getElementById('global-loading').style.display = 'none';
        alert('เกิดข้อผิดพลาดในการโหลดข้อมูล Firebase: ' + error.message);
    }
}

// --- 4. TRANSACTIONS CRUD ---
window.addTransaction = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    btn.textContent = '⏳ กำลังบันทึก...';
    btn.disabled = true;

    const form = document.getElementById('transaction-form');
    const editId = form.dataset.editId;

    const formData = {
        type: document.getElementById('type').value,
        category: document.getElementById('type').value === 'transfer' ? 'โอนเงิน/ย้ายเงิน' : document.getElementById('category').value,
        amount: parseFloat(document.getElementById('amount').value),
        date: document.getElementById('date').value,
        description: document.getElementById('description').value,
        wallet: document.getElementById('wallet').value,
        toWallet: document.getElementById('type').value === 'transfer' ? document.getElementById('to-wallet').value : ''
    };

    if(formData.type === 'transfer' && formData.wallet === formData.toWallet) {
        alert("ไม่สามารถโอนเงินเข้ากระเป๋าตัวเองได้ครับ");
        btn.textContent = editId ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล';
        btn.disabled = false;
        return;
    }

    try {
        if (editId) {
            await updateDoc(doc(db, "transactions", editId), formData);
            const index = allTransactions.findIndex(t => t.id === editId);
            if(index > -1) allTransactions[index] = { id: editId, ...formData };
        } else {
            const docRef = await addDoc(collection(db, "transactions"), formData);
            allTransactions.push({ id: docRef.id, ...formData });
        }

        resetFormState();
        updateDashboardUI();
        updateSearchUI();
        switchTab(editId ? 'search' : 'overview');
    } catch (error) {
        btn.textContent = editId ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล';
        btn.disabled = false;
        alert('เกิดข้อผิดพลาด: ' + error.message);
    }
};
document.getElementById('transaction-form').addEventListener('submit', window.addTransaction);

window.deleteItem = async function(id) {
    if(confirm('ยืนยันการลบรายการนี้?')) {
        document.getElementById('global-loading').style.display = 'flex';
        try {
            await deleteDoc(doc(db, "transactions", id));
            allTransactions = allTransactions.filter(t => t.id !== id);
            document.getElementById('global-loading').style.display = 'none';
            updateDashboardUI();
            updateSearchUI();
        } catch (error) {
            document.getElementById('global-loading').style.display = 'none';
            alert('ลบข้อมูลไม่สำเร็จ: ' + error.message);
        }
    }
};

// --- 4.1 WALLET BALANCE ADJUSTMENT ---
window.editWalletBalance = async function(walletName) {
    const current = currentWalletBalances[walletName] || 0;
    const label = WALLET_LABELS[walletName] || walletName;
    const input = prompt(
        `แก้ไขยอดเงินคงเหลือของ "${label}"\nยอดปัจจุบัน: ฿${formatMoney(current)}\n\nกรอกยอดที่ถูกต้อง:`,
        String(Math.round(current * 100) / 100)
    );
    if (input === null) return;

    const newBalance = parseFloat(String(input).replace(/,/g, ''));
    if (isNaN(newBalance)) {
        alert('กรุณากรอกตัวเลขให้ถูกต้องครับ');
        return;
    }

    const diff = Math.round((newBalance - current) * 100) / 100;
    if (diff === 0) return;

    const diffText = (diff > 0 ? '+' : '-') + '฿' + formatMoney(Math.abs(diff));
    if (!confirm(`ปรับยอด ${label} จาก ฿${formatMoney(current)} เป็น ฿${formatMoney(newBalance)}\n(ส่วนต่าง ${diffText})\n\nยืนยัน?`)) return;

    document.getElementById('global-loading').style.display = 'flex';

    // เก็บเป็นรายการ "ปรับยอด" (ค่าติดลบได้) ไม่นับรวมในรายรับ/รายจ่าย
    const formData = {
        type: 'adjust',
        category: 'ยอดยกมา/ปรับยอด',
        amount: diff,
        date: todayString(),
        description: `ปรับยอดกระเป๋า ${label}`,
        wallet: walletName,
        toWallet: ''
    };

    try {
        const docRef = await addDoc(collection(db, "transactions"), formData);
        allTransactions.push({ id: docRef.id, ...formData });
        document.getElementById('global-loading').style.display = 'none';
        updateDashboardUI();
        updateSearchUI();
    } catch (error) {
        document.getElementById('global-loading').style.display = 'none';
        alert('เกิดข้อผิดพลาด: ' + error.message);
    }
};

// --- 5. BUDGETS CRUD ---
window.saveBudgetSettings = async function(e) {
    e.preventDefault();
    const y = document.getElementById('filter-year').value;
    const m = document.getElementById('filter-month').value;
    if(m === 'all') { alert('กรุณาเลือกเดือนก่อนบันทึกงบประมาณครับ'); return; }

    const btn = document.getElementById('budget-save-btn');
    btn.textContent = '...'; btn.disabled = true;

    const key = 'B-' + y + '-' + m;
    const formData = {
        needs: { type: document.getElementById('b-needs-type').value, value: parseFloat(document.getElementById('b-needs-val').value) || 0 },
        wants: { type: document.getElementById('b-wants-type').value, value: parseFloat(document.getElementById('b-wants-val').value) || 0 },
        savings: { type: document.getElementById('b-sav-type').value, value: parseFloat(document.getElementById('b-sav-val').value) || 0 }
    };

    try {
        await setDoc(doc(db, "budgets", key), formData);
        allBudgets[key] = formData;
        btn.textContent = 'บันทึกงบของเดือนนี้'; 
        btn.disabled = false;
        window.toggleBudgetForm();
        updateDashboardUI();
    } catch (error) {
        btn.textContent = 'บันทึกงบของเดือนนี้'; 
        btn.disabled = false;
        alert('เกิดข้อผิดพลาด: ' + error.message);
    }
};

window.toggleBudgetForm = function() {
    const form = document.getElementById('budget-form');
    if (form.classList.contains('hidden')) {
        form.classList.remove('hidden');
        
        const y = document.getElementById('filter-year').value;
        const m = document.getElementById('filter-month').value;
        
        const key = 'B-' + y + '-' + m; 
        
        let b = allBudgets[key] || { 
            needs: {type: 'fixed', value: ''}, wants: {type: 'fixed', value: ''}, savings: {type: 'fixed', value: ''} 
        };
        
        document.getElementById('b-needs-type').value = b.needs.type;
        document.getElementById('b-needs-val').value = b.needs.value;
        document.getElementById('b-wants-type').value = b.wants.type;
        document.getElementById('b-wants-val').value = b.wants.value;
        document.getElementById('b-sav-type').value = b.savings.type;
        document.getElementById('b-sav-val').value = b.savings.value;
    } else {
        form.classList.add('hidden');
    }
}

// --- 6. SUBSCRIPTIONS CRUD ---
const MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// แสดง/ซ่อนช่องเดือน-วัน ตามความถี่ที่เลือก
function toggleSubFrequencyFields() {
    const f = document.getElementById('sub-frequency').value;
    document.getElementById('sub-month-group').classList.toggle('hidden', f !== 'yearly');
    document.getElementById('sub-day-group').classList.toggle('hidden', f === 'daily');
    document.getElementById('sub-day').required = (f !== 'daily');
    document.getElementById('sub-day-label').textContent = f === 'yearly' ? 'วันที่ (1-31)' : 'จ่ายทุกวันที่ (1-31)';
}
document.getElementById('sub-frequency').addEventListener('change', toggleSubFrequencyFields);

// ข้อความบอกรอบการจ่าย (รองรับบิลเก่าที่ไม่มี frequency)
function getSubScheduleText(sub) {
    const f = sub.frequency || 'monthly';
    if (f === 'daily') return 'จ่ายทุกวัน';
    if (f === 'yearly') return `จ่ายทุกปี วันที่ ${sub.day} ${MONTH_SHORT[parseInt(sub.month)] || ''}`;
    return `จ่ายทุกวันที่ ${sub.day} ของเดือน`;
}
document.getElementById('sub-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.getElementById('sub-submit-btn');
    const originalText = btn.textContent;
    btn.textContent = '⏳ กำลังบันทึก...';
    btn.disabled = true;

    const form = document.getElementById('sub-form');
    const editId = form.dataset.editId;

    const frequency = document.getElementById('sub-frequency').value;
const formData = {
    title: document.getElementById('sub-title').value,
    type: document.getElementById('sub-type').value,
    category: document.getElementById('sub-category').value,
    amount: document.getElementById('sub-amount').value,
    wallet: document.getElementById('sub-wallet').value,
    frequency: frequency,
    month: frequency === 'yearly' ? document.getElementById('sub-month').value : '',
    day: frequency === 'daily' ? '' : document.getElementById('sub-day').value
};

    try {
        if(editId) {
            await updateDoc(doc(db, "subscriptions", editId), formData);
            const index = allSubscriptions.findIndex(s => s.id === editId);
            if(index > -1) allSubscriptions[index] = { id: editId, ...formData };
        } else {
            const docRef = await addDoc(collection(db, "subscriptions"), formData);
            allSubscriptions.push({ id: docRef.id, ...formData });
        }
        btn.textContent = originalText; 
        btn.disabled = false;
        resetSubForm();
        renderSubscriptions();
    } catch (error) {
        btn.textContent = originalText; 
        btn.disabled = false;
        alert('เกิดข้อผิดพลาด: ' + error.message);
    }
});

window.deleteSubscription = async function(id) {
    if(confirm('ยืนยันการลบบิลประจำนี้? (ข้อมูลบัญชีที่เคยบันทึกไปแล้วจะไม่หาย)')) {
        document.getElementById('global-loading').style.display = 'flex';
        try {
            await deleteDoc(doc(db, "subscriptions", id));
            allSubscriptions = allSubscriptions.filter(s => s.id !== id);
            document.getElementById('global-loading').style.display = 'none';
            renderSubscriptions();
        } catch (error) {
            document.getElementById('global-loading').style.display = 'none';
            alert('ลบข้อมูลไม่สำเร็จ: ' + error.message);
        }
    }
};

window.paySubscription = async function(id) {
    const sub = allSubscriptions.find(s => s.id === id);
    if(!sub) return;

    if(confirm(`ยืนยันการเพิ่มรายการ: ${sub.title} (฿${formatMoney(sub.amount)}) เข้าสมุดบัญชีของเดือนนี้?`)) {
        document.getElementById('global-loading').style.display = 'flex';
        
        const today = new Date();
const freq = sub.frequency || 'monthly';
let payDate;
if (freq === 'daily') {
    payDate = today;
} else {
    const targetMonth = freq === 'yearly' ? parseInt(sub.month) : today.getMonth();
    // กันกรณีวันที่ 31 แต่เดือนนั้นมีแค่ 30 วัน (ไม่ให้ข้ามไปเดือนถัดไป)
    const lastDay = new Date(today.getFullYear(), targetMonth + 1, 0).getDate();
    payDate = new Date(today.getFullYear(), targetMonth, Math.min(parseInt(sub.day), lastDay));
}
const formattedDate = payDate.getFullYear() + "-" + 
                      String(payDate.getMonth() + 1).padStart(2, '0') + "-" + 
                      String(payDate.getDate()).padStart(2, '0');

const formData = {
    type: sub.type,
    category: sub.category,
    amount: parseFloat(sub.amount),
    date: formattedDate,
    description: `บิลประจำ: ${sub.title}`,
    wallet: sub.wallet || 'Kplus',
    toWallet: ''
};

        try {
            const docRef = await addDoc(collection(db, "transactions"), formData);
            allTransactions.push({ id: docRef.id, ...formData });
            document.getElementById('global-loading').style.display = 'none';
            updateDashboardUI();
            updateSearchUI();
            alert(`✅ บันทึกรายการ "${sub.title}" ลงบัญชีเรียบร้อยแล้วครับ!`);
        } catch (error) {
            document.getElementById('global-loading').style.display = 'none';
            alert('เกิดข้อผิดพลาด: ' + error.message);
        }
    }
};

window.editSubscription = function(id) {
    const sub = allSubscriptions.find(s => String(s.id) === String(id));
    if(!sub) return;

    document.getElementById('sub-title').value = sub.title;
    document.getElementById('sub-type').value = sub.type;
    populateSubCategoryDropdown(sub.category);
    document.getElementById('sub-amount').value = sub.amount;
    document.getElementById('sub-wallet').value = sub.wallet || 'Kplus';
document.getElementById('sub-frequency').value = sub.frequency || 'monthly';
document.getElementById('sub-month').value = sub.month !== undefined && sub.month !== '' ? sub.month : '0';
toggleSubFrequencyFields();
document.getElementById('sub-day').value = sub.day || '';

    document.getElementById('sub-form-title').textContent = '✏️ แก้ไขบิลประจำ';
    const form = document.getElementById('sub-form');
    form.dataset.editId = id;

    const btn = document.getElementById('sub-submit-btn');
    btn.textContent = 'อัปเดตบิลประจำ';
    btn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
    btn.classList.add('bg-amber-500', 'hover:bg-amber-600');

    document.getElementById('sub-cancel-btn').classList.remove('hidden');
    document.getElementById('sub-form-title').scrollIntoView({ behavior: 'smooth' });
}

window.resetSubForm = function() { 
    document.getElementById('sub-form').reset();
    delete document.getElementById('sub-form').dataset.editId;
    
    document.getElementById('sub-form-title').textContent = '➕ เพิ่มบิลประจำใหม่';
    const btn = document.getElementById('sub-submit-btn');
    btn.textContent = 'บันทึกรายการประจำ';
    btn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
    btn.classList.remove('bg-amber-500', 'hover:bg-amber-600');
    
    document.getElementById('sub-cancel-btn').classList.add('hidden');
    populateSubCategoryDropdown();
    toggleSubFrequencyFields();
}

// --- DASHBOARD & UI FUNCTIONS ---
function updateDashboardUI() {
    const selectedYear = parseInt(document.getElementById('filter-year').value);
    const selectedMonth = document.getElementById('filter-month').value; 

    const dashData = allTransactions.filter(t => {
        const d = new Date(t.date);
        const matchesYear = d.getFullYear() === selectedYear;
        const matchesMonth = selectedMonth === 'all' || d.getMonth().toString() === selectedMonth;
        return matchesYear && matchesMonth;
    });

    let inc = 0, exp = 0, sav = 0;
    dashData.forEach(t => {
        const v = parseFloat(t.amount);
        if(t.type === 'income') inc += v;
        else if(t.type === 'expense') exp += v;
        else if(t.type === 'savings') sav += v;
        else if(t.type === 'refund') exp -= v; 
    });
    
    document.getElementById('dash-income').innerText = formatNumberShort(inc);
    document.getElementById('dash-expense').innerText = formatNumberShort(exp);
    document.getElementById('dash-savings').innerText = formatNumberShort(sav);

    const walletBalances = { 
        'Kplus': 0, 'TrueMoney': 0, 'ShopeePay': 0, 
        'Paotang': 0, 'KrungsriNext': 0, 'ttb': 0, 'tsb': 0, 'CreditCard': 0, 'Cash': 0, 'KKP': 0
    };

    allTransactions.forEach(t => {
        const v = parseFloat(t.amount);
        const w = t.wallet || 'Kplus';
        const toW = t.toWallet || '';
        
        if(walletBalances[w] === undefined) walletBalances[w] = 0;

        if(t.type === 'income' || t.type === 'refund' || t.type === 'adjust') {
            walletBalances[w] += v;
        } else if(t.type === 'expense' || t.type === 'savings') {
            walletBalances[w] -= v;
        } else if(t.type === 'transfer') {
            walletBalances[w] -= v; 
            if(toW) {
                if(walletBalances[toW] === undefined) walletBalances[toW] = 0;
                walletBalances[toW] += v;
            }
        }
    });

    currentWalletBalances = walletBalances;

    document.getElementById('wallet-balances').innerHTML = Object.keys(walletBalances).map(walletName => {
        const isCredit = walletName === 'CreditCard';
        const balance = walletBalances[walletName];
        const displayColor = balance < 0 ? (isCredit ? 'text-amber-600' : 'text-red-500') : 'text-slate-700';
        const label = WALLET_LABELS[walletName] || walletName;
        
        return `
        <div class="bg-white p-2 rounded-xl border border-white/50 flex justify-between items-center shadow-sm">
            <span class="text-[10px] font-semibold text-slate-500 truncate mr-1">${label}</span>
            <div class="flex items-center gap-1 shrink-0">
                <span class="text-xs font-bold ${displayColor}">฿${formatMoney(balance)}</span>
                <button type="button" onclick="window.editWalletBalance('${walletName}')" class="text-[10px] bg-amber-50 text-amber-600 w-5 h-5 rounded-md hover:bg-amber-100 flex items-center justify-center" title="แก้ไขยอด">✏️</button>
            </div>
        </div>
        `;
    }).join('');

    const y = document.getElementById('filter-year').value;
    const m = document.getElementById('filter-month').value;
    
    if (m === 'all') {
         document.getElementById('budget-display-container').classList.add('hidden');
         document.getElementById('budget-alert').classList.remove('hidden');
         document.getElementById('budget-toggle-btn').classList.add('hidden');
         document.getElementById('budget-month-label').textContent = '';
    } else {
         document.getElementById('budget-display-container').classList.remove('hidden');
         document.getElementById('budget-alert').classList.add('hidden');
         document.getElementById('budget-toggle-btn').classList.remove('hidden');
         
         const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
         document.getElementById('budget-month-label').textContent = `(รอบ ${monthNames[parseInt(m)]} ${y})`;

         const key = 'B-' + y + '-' + m;
         let b = allBudgets[key] || { 
             needs: {type: 'fixed', value: 0}, wants: {type: 'fixed', value: 2000}, savings: {type: 'fixed', value: 1000} 
         };

         let actualNeeds = 0, actualWants = 0, actualSav = 0;
         dashData.forEach(t => {
             let val = parseFloat(t.amount);
             if (t.type === 'expense') {
                 if (bucketMap.needs.includes(t.category)) actualNeeds += val;
                 else if (bucketMap.wants.includes(t.category)) actualWants += val;
                 else actualNeeds += val;
             } else if (t.type === 'refund') { 
                 if (bucketMap.needs.includes(t.category)) actualNeeds -= val;
                 else if (bucketMap.wants.includes(t.category)) actualWants -= val;
                 else actualNeeds -= val;
             } else if (t.type === 'savings') {
                 actualSav += val;
             }
         });

         const updateBar = (idPrefix, actual, type, val, incTotal, isSavings) => {
             let target = type === 'percent' ? incTotal * (val / 100) : val;
             let textEl = document.getElementById(`budget-${idPrefix}-text`);
             let barEl = document.getElementById(`budget-${idPrefix}-bar`);
             
             let displayActual = Math.max(0, actual); 

             if (target > 0) {
                 textEl.innerText = `${isSavings ? 'ออมแล้ว' : 'ใช้ไป'} ฿${displayActual.toLocaleString()} / ${isSavings ? 'เป้า' : 'งบ'} ฿${target.toLocaleString()}`;
                 let p = (displayActual / target) * 100;
                 if(p > 100) p = 100;
                 barEl.style.width = `${p}%`;
                 
                 if (isSavings) {
                     barEl.className = 'h-2 rounded-full transition-all duration-500 ' + (p >= 100 ? 'bg-emerald-500' : 'bg-emerald-300');
                 } else {
                     barEl.className = 'h-2 rounded-full transition-all duration-500 ' + (p >= 90 ? 'bg-red-500' : (p >= 75 ? 'bg-amber-400' : 'bg-blue-400'));
                 }
             } else {
                 textEl.innerText = `${isSavings ? 'ออมแล้ว' : 'ใช้ไป'} ฿${displayActual.toLocaleString()} / ยังไม่ตั้งเป้า`;
                 barEl.style.width = '0%';
                 barEl.className = 'bg-slate-300 h-2 rounded-full transition-all';
             }
         };

         updateBar('needs', actualNeeds, b.needs.type, b.needs.value, inc, false);
         updateBar('wants', actualWants, b.wants.type, b.wants.value, inc, false);
         updateBar('sav', actualSav, b.savings.type, b.savings.value, inc, true);
    }

    const netExpenseMap = {};
    dashData.forEach(t => {
        if (t.type === 'expense') {
            netExpenseMap[t.category] = (netExpenseMap[t.category] || 0) + parseFloat(t.amount);
        } else if (t.type === 'refund') {
            netExpenseMap[t.category] = (netExpenseMap[t.category] || 0) - parseFloat(t.amount);
        }
    });
    
    const netExpenseData = Object.keys(netExpenseMap)
        .filter(cat => netExpenseMap[cat] > 0)
        .map(cat => ({ category: cat, amount: netExpenseMap[cat] }));

    renderExpensePieChart(netExpenseData);
    renderTopExpenses(netExpenseData);
    renderRecentList(dashData);

    const yearlyData = allTransactions.filter(t => new Date(t.date).getFullYear() === selectedYear);
    document.getElementById('chart-year-label').textContent = `(${selectedYear})`;
    renderYearlyChart(yearlyData);
}

function renderTopExpenses(expenseData) {
    const container = document.getElementById('top-expenses');
    if(expenseData.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-2">ไม่มีข้อมูล</p>';
        return;
    }

    const catMap = {};
    expenseData.forEach(t => {
        catMap[t.category] = (catMap[t.category] || 0) + parseFloat(t.amount);
    });

    const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const medals = ['🥇', '🥈', '🥉'];

    container.innerHTML = sortedCats.map((item, index) => `
        <div class="flex justify-between items-center text-xs">
            <span class="text-slate-600 truncate mr-2">${medals[index] || (index + 1) + '.'} ${item[0]}</span>
            <span class="text-red-500 font-bold shrink-0">-฿${formatMoney(item[1])}</span>
        </div>
    `).join('');
}

function renderRecentList(data) {
    const container = document.getElementById('recent-5-list');
    const sorted = [...data].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    
    if (sorted.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">ยังไม่มีรายการ</p>';
        return;
    }

    container.innerHTML = sorted.map(t => {
        let amountColor = 'text-red-500', sign = '-';
        let amountText = formatMoney(t.amount);
        if (t.type === 'income') { amountColor = 'text-green-600'; sign = '+'; }
        else if (t.type === 'savings') { amountColor = 'text-blue-600'; sign = ''; }
        else if (t.type === 'refund') { amountColor = 'text-emerald-500'; sign = '+'; } 
        else if (t.type === 'transfer') { amountColor = 'text-slate-500'; sign = ''; }
        else if (t.type === 'adjust') {
            const v = parseFloat(t.amount);
            amountColor = v >= 0 ? 'text-green-600' : 'text-red-500';
            sign = v >= 0 ? '+' : '-';
            amountText = formatMoney(Math.abs(v));
        }

        const d = new Date(t.date);
        const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}`;

        return `
        <div class="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
            <div class="flex flex-col overflow-hidden">
                <span class="text-xs font-bold text-slate-700 truncate">${t.category}</span>
                <span class="text-[10px] text-slate-400 truncate">${dateStr} • ${t.description || '-'}</span>
            </div>
            <span class="text-xs font-bold ${amountColor} shrink-0 pl-2">${sign}฿${amountText}</span>
        </div>
    `}).join('');
}

function updateSearchUI() {
    const selectedYear = parseInt(document.getElementById('filter-year').value) || new Date().getFullYear();
    const listMonth = document.getElementById('list-month').value;
    const listCat = document.getElementById('list-category').value;
    const listSearch = document.getElementById('list-search').value.toLowerCase();
    const listWallet = document.getElementById('list-wallet').value;
    const listBucket = document.getElementById('list-bucket').value;
    const monthToVal = document.getElementById('list-month-to').value;
    const dayFromRaw = document.getElementById('list-day-from').value;
    const dayToRaw = document.getElementById('list-day-to').value;
    const dayFrom = dayFromRaw !== '' ? parseInt(dayFromRaw) : null;
    const dayTo = dayToRaw !== '' ? parseInt(dayToRaw) : null;

    const listData = allTransactions.filter(t => {
        const d = new Date(t.date);
        let matchMonth = true, matchDay = true;
        if (listMonth === 'all') {
            // ไม่ได้เลือกเดือน: กรองเฉพาะวันที่ (ถ้าระบุ) ของทุกเดือน
            if (dayFrom !== null || dayTo !== null) {
                const lo = dayFrom !== null ? dayFrom : 1;
                const hi = dayTo !== null ? dayTo : (dayFrom !== null ? dayFrom : 31);
                matchDay = d.getDate() >= Math.min(lo, hi) && d.getDate() <= Math.max(lo, hi);
            }
        } else {
            // กรองเป็นช่วงต่อเนื่อง: (เดือนเริ่ม, วันเริ่ม) ถึง (เดือนสิ้นสุด, วันสิ้นสุด)
            const mFrom = parseInt(listMonth);
            const mTo = monthToVal === '' ? mFrom : parseInt(monthToVal);
            const startM = Math.min(mFrom, mTo), endM = Math.max(mFrom, mTo);
            const startD = dayFrom !== null ? dayFrom : 1;
            // ช่วงหลายเดือน: ถ้าไม่ระบุวันสิ้นสุด = สิ้นเดือนสุดท้าย / เดือนเดียว: ไม่ระบุ = วันเดียวกับวันเริ่ม
            const endD = dayTo !== null ? dayTo : (monthToVal === '' && dayFrom !== null ? dayFrom : 31);
            const key = d.getMonth() * 100 + d.getDate();
            matchMonth = key >= startM * 100 + startD && key <= endM * 100 + endD;
        }
        const matchCat = listCat === 'all' || t.category === listCat;
        const desc = t.description ? t.description.toLowerCase() : "";
        const title = t.category.toLowerCase();
        const matchSearch = !listSearch || desc.includes(listSearch) || title.includes(listSearch);
        const matchWallet = listWallet === 'all' || (t.wallet || 'Kplus') === listWallet || t.toWallet === listWallet;

        let matchBucket = true;
        if (listBucket !== 'all') {
            // แบ่งกลุ่มเหมือนแถบงบประมาณ: รายจ่าย/คืนเงินที่ไม่อยู่ใน "ความสุข" นับเป็น "จำเป็น"
            let bucket = null;
            if (t.type === 'savings') bucket = 'savings';
            else if (t.type === 'expense' || t.type === 'refund') bucket = bucketMap.wants.includes(t.category) ? 'wants' : 'needs';
            matchBucket = bucket === listBucket;
        }

        return matchMonth && matchDay && matchBucket && matchCat && matchSearch && matchWallet;
    });

    let searchInc = 0, searchExp = 0, searchSav = 0;
    listData.forEach(t => {
        const v = parseFloat(t.amount);
        if(t.type === 'income') searchInc += v;
        else if(t.type === 'expense') searchExp += v;
        else if(t.type === 'savings') searchSav += v;
        else if(t.type === 'refund') searchExp -= v;
    });

    document.getElementById('search-count').innerText = `${listData.length} รายการ`;
    document.getElementById('search-sum-inc').innerText = '+' + formatNumberShort(searchInc);
    document.getElementById('search-sum-exp').innerText = '-' + formatNumberShort(searchExp);
    document.getElementById('search-sum-sav').innerText = 'ออม ' + formatNumberShort(searchSav); 

    renderFullList(listData);
}

function renderFullList(data) {
    const container = document.getElementById('full-transactions-list');
    const sorted = [...data].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (sorted.length === 0) {
        container.innerHTML = '<div class="text-center text-slate-400 py-10 text-sm">ไม่พบรายการที่ตรงกับเงื่อนไข</div>';
        return;
    }

    container.innerHTML = sorted.map(t => {
        let amountColor = 'text-red-500', sign = '-฿';
        let amountText = formatMoney(t.amount);
        if (t.type === 'income') { amountColor = 'text-green-600'; sign = '+฿'; }
        else if (t.type === 'savings') { amountColor = 'text-slate-800'; sign = 'ออม ฿'; }
        else if (t.type === 'refund') { amountColor = 'text-emerald-500'; sign = 'คืนเงิน ฿'; } 
        else if (t.type === 'transfer') { amountColor = 'text-slate-500'; sign = 'โอน ฿'; }
        else if (t.type === 'adjust') {
            const v = parseFloat(t.amount);
            amountColor = v >= 0 ? 'text-green-600' : 'text-red-500';
            sign = v >= 0 ? 'ปรับยอด +฿' : 'ปรับยอด -฿';
            amountText = formatMoney(Math.abs(v));
        }

        const d = new Date(t.date);
        const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}`;

        let walletInfo = '';
        if (t.type === 'transfer') {
            walletInfo = `${WALLET_LABELS[t.wallet] || t.wallet || ''} → ${WALLET_LABELS[t.toWallet] || t.toWallet || ''}`;
        } else if (t.wallet) {
            walletInfo = WALLET_LABELS[t.wallet] || t.wallet;
        }

        const editBtn = t.type === 'adjust' ? '' :
            `<button type="button" onclick="window.editItem('${t.id}')" class="text-[10px] bg-amber-50 text-amber-600 px-3 py-1 rounded-md hover:bg-amber-100 transition-colors cursor-pointer pointer-events-auto">แก้ไข</button>`;

        return `
        <div class="p-3 bg-white hover:bg-slate-50 transition-colors relative group border-b border-slate-50">
            <div class="flex justify-between items-start mb-1">
                <div class="font-bold text-slate-800 text-sm truncate pr-2">${t.category}</div>
                <div class="font-bold ${amountColor} text-sm shrink-0">${sign}${amountText}</div>
            </div>
            
            <div class="flex justify-between items-center w-full"> 
                <div class="text-[10px] text-slate-400 flex-1 min-w-0 pr-2"> 
                    ${dateStr} ${walletInfo ? '• ' + walletInfo : ''} <br>
                    <span class="text-slate-500 truncate block">${t.description || ''}</span> 
                </div>
                
                <div class="flex gap-2 shrink-0"> 
                    ${editBtn}
                    <button type="button" onclick="window.deleteItem('${t.id}')" class="text-[10px] bg-red-50 text-red-500 px-3 py-1 rounded-md hover:bg-red-100 transition-colors cursor-pointer pointer-events-auto">ลบ</button>
                </div>
            </div>
        </div>
    `}).join('');
}

function renderExpensePieChart(expenseData) {
    const ctx = document.getElementById('expensePieChart').getContext('2d');
    if(charts['expensePie']) charts['expensePie'].destroy();

    const map = {};
    expenseData.forEach(t => { map[t.category] = (map[t.category] || 0) + parseFloat(t.amount); });
    
    const colors = ['#fca5a5', '#93c5fd', '#86efac', '#fde047', '#d8b4fe', '#fdba74', '#fda4af', '#a7f3d0', '#fef08a', '#c4b5fd', '#f9a8d4'];

    charts['expensePie'] = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(map).length > 0 ? Object.keys(map) : ['ไม่มีข้อมูล'],
            datasets: [{
                data: Object.keys(map).length > 0 ? Object.values(map) : [1],
                backgroundColor: Object.keys(map).length > 0 ? Object.keys(map).map((_, i) => colors[i % colors.length]) : ['#f1f5f9'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: Object.keys(map).length > 0 }
            }
        }
    });
}

function renderYearlyChart(data) {
    const ctx = document.getElementById('yearlyChart').getContext('2d');
    if (charts['yearly']) charts['yearly'].destroy();

    const months = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    const inc = new Array(12).fill(0);
    const exp = new Array(12).fill(0);

    data.forEach(t => {
        const m = new Date(t.date).getMonth();
        const v = parseFloat(t.amount);
        if(t.type === 'income') inc[m] += v;
        else if(t.type === 'expense') exp[m] += v;
        else if(t.type === 'refund') exp[m] -= v;
    });

    charts['yearly'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'รายรับ',
                    data: inc,
                    backgroundColor: '#86efac',
                    borderRadius: 4,
                    barPercentage: 0.6
                },
                {
                    label: 'รายจ่าย',
                    data: exp,
                    backgroundColor: '#fca5a5',
                    borderRadius: 4,
                    barPercentage: 0.6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    beginAtZero: true, 
                    grid: { color: '#f1f5f9' },
                    ticks: {
                        font: { size: 10, family: 'Prompt' },
                        callback: function(value) { return value.toLocaleString(); }
                    }
                },
                x: { 
                    grid: { display: false },
                    ticks: { font: { size: 10, family: 'Prompt' } }
                }
            },
            plugins: {
                legend: { 
                    position: 'top', 
                    align: 'end',
                    labels: { boxWidth: 10, font: { size: 10, family: 'Prompt' } }
                }
            }
        }
    });
}

// --- 8. CALENDAR LOGIC ---
let calendarDate = new Date();

window.changeCalendarMonth = function(delta) {
    calendarDate.setMonth(calendarDate.getMonth() + delta);
    renderCalendar();
}

function renderCalendar() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const monthNames = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
    document.getElementById('calendar-month-label').textContent = `${monthNames[month]} ${year}`;

    const dayData = {};
    allTransactions.forEach(t => {
        const d = new Date(t.date);
        if (d.getFullYear() === year && d.getMonth() === month) {
            const day = d.getDate();
            if (!dayData[day]) dayData[day] = { income: 0, expense: 0, savings: 0, refund: 0 };
            const v = parseFloat(t.amount);
            if (t.type === 'income') dayData[day].income += v;
            else if (t.type === 'expense') dayData[day].expense += v;
            else if (t.type === 'savings') dayData[day].savings += v;
            else if (t.type === 'refund') dayData[day].refund += v;
        }
    });

    let mInc = 0, mExp = 0, mSav = 0;
Object.values(dayData).forEach(d => {
    mInc += d.income;
    mExp += d.expense - d.refund;
    mSav += d.savings;
});
document.getElementById('cal-sum-inc').textContent = formatNumberShort(mInc);
document.getElementById('cal-sum-exp').textContent = formatNumberShort(mExp);
document.getElementById('cal-sum-sav').textContent = formatNumberShort(mSav);

    const firstDayOfWeek = new Date(year, month, 1).getDay(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    let html = '';
    for (let i = 0; i < firstDayOfWeek; i++) {
        html += `<div class="h-[72px]"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const info = dayData[day];
        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
        const dow = new Date(year, month, day).getDay();
        const numColor = dow === 0 ? 'text-red-400' : (isToday ? 'text-indigo-600' : 'text-slate-600');

        let lines = '';
        if (info) {
            const netAmount = (info.income + info.refund) - (info.expense + info.savings);
            const typesPresent = [info.income, info.expense, info.savings, info.refund].filter(v => v > 0).length;

            if (info.income > 0) lines += `<div class="text-blue-500">${formatMoney(info.income)}</div>`;
            if (info.expense > 0) lines += `<div class="text-red-400">${formatMoney(info.expense)}</div>`;
            if (info.savings > 0) lines += `<div class="text-purple-500">${formatMoney(info.savings)}</div>`;
            if (info.refund > 0) lines += `<div class="text-emerald-500">${formatMoney(info.refund)}</div>`;

            if (typesPresent > 1) {
                const sign = netAmount < 0 ? '-' : '+';
                lines += `<div class="text-slate-800 font-bold border-t border-slate-100 mt-0.5 pt-0.5">${sign}${formatMoney(Math.abs(netAmount))}</div>`;
            }
        }

        html += `
        <div onclick="window.openDayDetail(${year}, ${month}, ${day})" class="h-[72px] p-1 rounded-lg cursor-pointer hover:bg-slate-50 ${isToday ? 'ring-2 ring-indigo-300' : ''} flex flex-col">
            <div class="text-[11px] font-bold ${numColor} px-0.5">${day}</div>
            <div class="flex-1 flex flex-col justify-end items-end text-[9px] leading-tight font-semibold px-0.5">
                ${lines}
            </div>
        </div>`;
    }

    document.getElementById('calendar-grid').innerHTML = html;
    document.getElementById('calendar-day-detail').classList.add('hidden');
}

window.openDayDetail = function(year, month, day) {
    const targetDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayTransactions = allTransactions.filter(t => t.date.substring(0, 10) === targetDateStr);

    const panel = document.getElementById('calendar-day-detail');
    const title = document.getElementById('calendar-day-title');
    const list = document.getElementById('calendar-day-list');

    title.textContent = `รายการวันที่ ${day}/${month + 1}/${year} (${dayTransactions.length} รายการ)`;

    if (dayTransactions.length === 0) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">ไม่มีรายการในวันนี้</p>';
    } else {
        list.innerHTML = dayTransactions.map(t => {
            let amountColor = 'text-red-500', sign = '-฿';
            let amountText = formatMoney(t.amount);
            if (t.type === 'income') { amountColor = 'text-green-600'; sign = '+฿'; }
            else if (t.type === 'savings') { amountColor = 'text-purple-600'; sign = 'ออม ฿'; }
            else if (t.type === 'refund') { amountColor = 'text-emerald-500'; sign = 'คืนเงิน ฿'; }
            else if (t.type === 'transfer') { amountColor = 'text-slate-500'; sign = 'โอน ฿'; }
            else if (t.type === 'adjust') {
                const v = parseFloat(t.amount);
                amountColor = v >= 0 ? 'text-green-600' : 'text-red-500';
                sign = v >= 0 ? 'ปรับยอด +฿' : 'ปรับยอด -฿';
                amountText = formatMoney(Math.abs(v));
            }

            let walletInfo = WALLET_LABELS[t.wallet] || t.wallet || '';
            if (t.type === 'transfer') {
                walletInfo = `${WALLET_LABELS[t.wallet] || t.wallet || ''} → ${WALLET_LABELS[t.toWallet] || t.toWallet || ''}`;
            }

            const editBtn = t.type === 'adjust' ? '' :
                `<button type="button" onclick="window.editItem('${t.id}')" class="text-[10px] bg-amber-50 text-amber-600 px-2 py-1 rounded-md hover:bg-amber-100">แก้ไข</button>`;

            return `
            <div class="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                <div class="flex flex-col overflow-hidden">
                    <span class="text-xs font-bold text-slate-700 truncate">${t.category}</span>
                    <span class="text-[10px] text-slate-400 truncate">${walletInfo} ${t.description ? '• ' + t.description : ''}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0 pl-2">
                    <span class="text-xs font-bold ${amountColor}">${sign}${amountText}</span>
                    ${editBtn}
                </div>
            </div>`;
        }).join('');
    }

    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.switchTab = function(tabName) {  
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('block'));
    
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    document.getElementById(`tab-${tabName}`).classList.add('block');

    document.querySelectorAll('.nav-btn span:last-child').forEach(el => {
        el.classList.remove('text-indigo-600');
        el.classList.add('text-slate-400');
    });
    const activeBtnSpan = document.querySelector(`.nav-btn[data-target="tab-${tabName}"] span:last-child`);
    if(activeBtnSpan) {
        activeBtnSpan.classList.remove('text-slate-400');
        activeBtnSpan.classList.add('text-indigo-600');
    }

    if(allTransactions.length > 0 && tabName === 'overview') updateDashboardUI();
    if(tabName === 'subs') renderSubscriptions();
    if(tabName === 'calendar') renderCalendar(); 
}

window.resetFormState = function() { 
    document.getElementById('transaction-form').reset();
    document.getElementById('date').valueAsDate = new Date();
    
    const form = document.getElementById('transaction-form');
    delete form.dataset.editId;
    
    const btn = document.getElementById('submit-btn');
    btn.textContent = 'บันทึกข้อมูล';
    btn.disabled = false;
    btn.classList.add('bg-[#93c5fd]', 'hover:bg-[#60a5fa]', 'text-blue-900');
    btn.classList.remove('bg-amber-400', 'hover:bg-amber-500', 'text-white');
    
    document.getElementById('cancel-btn').classList.add('hidden');
    document.getElementById('record-title').textContent = 'บันทึกรายการ';
    document.getElementById('form-subtitle').innerHTML = '✍️ บันทึกรายการใหม่';

    // populateCategoryDropdown จะจัดการสลับช่องหมวดหมู่ / กระเป๋าปลายทาง ให้เอง
    populateCategoryDropdown();
    
    document.getElementById('wallet').value = 'Kplus';
    document.getElementById('to-wallet').value = 'Kplus';
}

window.editItem = function(id) { 
    try {
        const item = allTransactions.find(t => String(t.id) === String(id));
        if(!item) return alert('ไม่พบข้อมูลรายการนี้ในระบบ');
        
        switchTab('record');
        document.getElementById('type').value = item.type;
        populateCategoryDropdown(item.category);
        document.getElementById('amount').value = item.amount;
        if(item.date) document.getElementById('date').value = item.date.substring(0, 10);
        document.getElementById('description').value = item.description || '';
        
        document.getElementById('wallet').value = item.wallet || 'Kplus'; 
        document.getElementById('to-wallet').value = item.toWallet || 'Kplus';

        document.getElementById('record-title').textContent = 'แก้ไขรายการ';
        document.getElementById('form-subtitle').innerHTML = '✏️ แก้ไขข้อมูล';
        
        const form = document.getElementById('transaction-form');
        form.dataset.editId = id; 
        
        const btn = document.getElementById('submit-btn');
        btn.textContent = 'บันทึกการแก้ไข';
        btn.classList.replace('bg-[#93c5fd]', 'bg-amber-400');
        btn.classList.replace('hover:bg-[#60a5fa]', 'hover:bg-amber-500');
        btn.classList.replace('text-blue-900', 'text-white');

        document.getElementById('cancel-btn').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        alert('เกิดข้อผิดพลาดในการเตรียมแก้ไขข้อมูล: ' + error.message);
    }
}

function renderSubscriptions() {
    const container = document.getElementById('subs-list');
    if(allSubscriptions.length === 0) {
        container.innerHTML = '<div class="text-center p-6 bg-white rounded-2xl border border-slate-100 text-slate-400 text-sm">ยังไม่มีบิลประจำ<br>เพิ่มบิลใหม่ด้านล่างได้เลยครับ👇</div>';
        return;
    }

    container.innerHTML = allSubscriptions.map(sub => {
        let amountColor = 'text-red-500';
        let icon = '💸';
        if (sub.type === 'income') { amountColor = 'text-green-600'; icon = '💰'; }
        else if (sub.type === 'savings') { amountColor = 'text-blue-600'; icon = '🏦'; }

        return `
        <div class="p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <div class="font-bold text-slate-800 text-sm">${icon} ${sub.title}</div>
                    <div class="text-[10px] text-slate-500 mt-0.5">หมวดหมู่: ${sub.category} • ${getSubScheduleText(sub)}</div>
<div class="text-[10px] text-slate-400">กระเป๋า: ${WALLET_LABELS[sub.wallet || 'Kplus'] || sub.wallet}</div>
                </div>
                <div class="font-bold ${amountColor}">฿${formatMoney(sub.amount)}</div>
            </div>
            
            <div class="flex gap-2">
                <button onclick="window.paySubscription('${sub.id}')" class="flex-1 bg-green-50 hover:bg-green-100 text-green-700 font-bold py-2 rounded-lg text-xs transition-colors flex justify-center items-center gap-1">
                    ➕ ${(sub.frequency || 'monthly') === 'daily' ? 'บันทึกจ่ายวันนี้' : ((sub.frequency || 'monthly') === 'yearly' ? 'บันทึกจ่ายปีนี้' : 'บันทึกจ่ายเดือนนี้')}
                </button>
                <div class="flex gap-1 shrink-0">
                    <button onclick="window.editSubscription('${sub.id}')" class="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg text-xs transition-colors">✏️</button>
                    <button onclick="window.deleteSubscription('${sub.id}')" class="bg-red-50 hover:bg-red-100 text-red-500 px-3 py-2 rounded-lg text-xs transition-colors">🗑️</button>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

// ==========================================
// --- CATEGORY MANAGER (แก้ไขหมวดหมู่เองได้) ---
const SYSTEM_CAT = 'ยอดยกมา/ปรับยอด'; // ใช้โดยระบบปรับยอด ห้ามแก้/ลบ
let catMgrType = 'expense';

function rebuildDerivedCategories() {
    categories.refund = [...categories.expense];
    bucketMap.needs = categories.expense.filter(c => !bucketMap.wants.includes(c));
}
rebuildDerivedCategories();

function applyCategoryConfig(cfg) {
    ['expense', 'income', 'savings'].forEach(k => {
        if (Array.isArray(cfg[k]) && cfg[k].length) categories[k] = [...cfg[k]];
    });
    if (!categories.income.includes(SYSTEM_CAT)) categories.income.push(SYSTEM_CAT);
    if (Array.isArray(cfg.wants)) bucketMap.wants = cfg.wants.filter(c => categories.expense.includes(c));
    rebuildDerivedCategories();
}

function snapshotCategoryConfig() {
    return JSON.parse(JSON.stringify({
        expense: categories.expense, income: categories.income, savings: categories.savings, wants: bucketMap.wants
    }));
}

async function saveCategoryConfig() {
    await setDoc(doc(db, "budgets", "config-categories"), snapshotCategoryConfig());
}

function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function rebuildSearchCategoryFilter() {
    const sel = document.getElementById('list-category');
    const cur = sel.value;
    sel.innerHTML = '<option value="all">ทุกหมวดหมู่</option>';
    // รวมหมวดที่ยังมีในรายการเก่าด้วย (กรณีหมวดถูกลบไปแล้ว)
    const names = new Set([
        ...categories.income, ...categories.expense, ...categories.savings,
        ...allTransactions.filter(t => t.type !== 'transfer').map(t => t.category).filter(Boolean)
    ]);
    names.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        sel.appendChild(opt);
    });
    sel.value = [...sel.options].some(o => o.value === cur) ? cur : 'all';
}

function refreshCategoryDropdowns() {
    populateCategoryDropdown(document.getElementById('category').value || null);
    populateSubCategoryDropdown(document.getElementById('sub-category').value || null);
}

async function propagateCategoryRename(type, oldName, newName) {
    const types = type === 'expense' ? ['expense', 'refund'] : [type];
    const ops = [
        ...allTransactions.filter(t => types.includes(t.type) && t.category === oldName).map(x => ['transactions', x]),
        ...allSubscriptions.filter(x => types.includes(x.type) && x.category === oldName).map(x => ['subscriptions', x])
    ];
    for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        ops.slice(i, i + 400).forEach(([col, x]) => batch.update(doc(db, col, x.id), { category: newName }));
        await batch.commit();
    }
    ops.forEach(([, x]) => { x.category = newName; });
}

async function commitCategoryChange(before, extra) {
    const loading = document.getElementById('global-loading');
    loading.style.display = 'flex';
    try {
        await saveCategoryConfig();
    } catch (error) {
        applyCategoryConfig(before); // บันทึกไม่สำเร็จ: ย้อนกลับ
        loading.style.display = 'none';
        alert('บันทึกหมวดหมู่ไม่สำเร็จ: ' + error.message);
        renderCategoryManager();
        return;
    }
    try {
        if (extra) await extra();
    } catch (error) {
        alert('อัปเดตรายการเก่าไม่สำเร็จบางส่วน: ' + error.message);
    }
    loading.style.display = 'none';
    refreshCategoryDropdowns();
    rebuildSearchCategoryFilter();
    updateDashboardUI();
    updateSearchUI();
    renderSubscriptions();
    renderCategoryManager();
}

function renderCategoryManager() {
    const t = catMgrType;
    ['expense', 'income', 'savings'].forEach(k => {
        const b = document.getElementById('cat-tab-' + k);
        b.className = 'py-1.5 rounded-lg text-xs font-semibold ' + (k === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500');
    });
    document.getElementById('cat-new-bucket').classList.toggle('hidden', t !== 'expense');
    document.getElementById('cat-hint').textContent = t === 'expense'
        ? 'เลือกกลุ่มของแต่ละหมวด (จำเป็น/ความสุข) เพื่อใช้คิดงบประมาณ • หมวดของ "คืนเงิน" ใช้ชุดเดียวกับรายจ่าย • เปลี่ยนชื่อจะอัปเดตรายการเก่าให้ด้วย • การลบไม่ลบรายการเก่า'
        : 'เปลี่ยนชื่อจะอัปเดตรายการเก่าให้ด้วย • การลบหมวดไม่ลบรายการเก่า';

    document.getElementById('cat-list').innerHTML = categories[t].map((name, i) => {
        const locked = name === SYSTEM_CAT;
        const bucket = t === 'expense'
            ? `<select data-action="bucket" data-idx="${i}" class="px-1.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] outline-none">
                   <option value="needs" ${bucketMap.wants.includes(name) ? '' : 'selected'}>จำเป็น</option>
                   <option value="wants" ${bucketMap.wants.includes(name) ? 'selected' : ''}>ความสุข</option>
               </select>` : '';
        const actions = locked
            ? '<span class="text-[10px] text-slate-400">🔒 ระบบ</span>'
            : `<button type="button" data-action="rename" data-idx="${i}" class="text-[10px] bg-amber-50 text-amber-600 px-2.5 py-1 rounded-md hover:bg-amber-100">แก้ชื่อ</button>
               <button type="button" data-action="delete" data-idx="${i}" class="text-[10px] bg-red-50 text-red-500 px-2.5 py-1 rounded-md hover:bg-red-100">ลบ</button>`;
        return `<div class="flex items-center justify-between gap-2 py-2">
            <span class="text-sm text-slate-700 truncate flex-1 min-w-0">${escHtml(name)}</span>
            <div class="flex items-center gap-1.5 shrink-0">${bucket}${actions}</div>
        </div>`;
    }).join('');
}

window.openCategoryManager = function(type) {
    catMgrType = ['expense', 'income', 'savings'].includes(type) ? type : 'expense';
    document.getElementById('cat-modal').classList.remove('hidden');
    renderCategoryManager();
};
window.closeCategoryManager = function() {
    document.getElementById('cat-modal').classList.add('hidden');
};
window.setCategoryManagerType = function(type) {
    catMgrType = type;
    renderCategoryManager();
};

window.addCategoryFromModal = async function() {
    const input = document.getElementById('cat-new-name');
    const name = input.value.trim();
    const t = catMgrType;
    if (!name) return;
    if (categories[t].includes(name)) { alert('มีหมวดหมู่นี้อยู่แล้วครับ'); return; }
    const before = snapshotCategoryConfig();
    categories[t].push(name);
    if (t === 'expense' && document.getElementById('cat-new-bucket').value === 'wants') bucketMap.wants.push(name);
    rebuildDerivedCategories();
    input.value = '';
    await commitCategoryChange(before);
};

async function renameCategory(idx) {
    const t = catMgrType;
    const oldName = categories[t][idx];
    if (oldName === SYSTEM_CAT) return;
    const input = prompt(`เปลี่ยนชื่อหมวดหมู่ "${oldName}" เป็น:\n(รายการเก่าที่ใช้หมวดนี้จะถูกเปลี่ยนชื่อตามด้วย)`, oldName);
    if (input === null) return;
    const newName = input.trim();
    if (!newName || newName === oldName) return;
    if (categories[t].includes(newName)) { alert('มีหมวดหมู่นี้อยู่แล้วครับ'); return; }
    const before = snapshotCategoryConfig();
    categories[t][idx] = newName;
    bucketMap.wants = bucketMap.wants.map(c => c === oldName ? newName : c);
    rebuildDerivedCategories();
    await commitCategoryChange(before, () => propagateCategoryRename(t, oldName, newName));
}

async function deleteCategory(idx) {
    const t = catMgrType;
    const name = categories[t][idx];
    if (name === SYSTEM_CAT) return;
    if (categories[t].length <= 1) { alert('ต้องเหลืออย่างน้อย 1 หมวดหมู่ครับ'); return; }
    if (!confirm(`ลบหมวดหมู่ "${name}" ออกจากตัวเลือก?\n(รายการเก่าที่ใช้หมวดนี้จะยังอยู่ ไม่ถูกลบ)`)) return;
    const before = snapshotCategoryConfig();
    categories[t].splice(idx, 1);
    bucketMap.wants = bucketMap.wants.filter(c => c !== name);
    rebuildDerivedCategories();
    await commitCategoryChange(before);
}

async function changeCategoryBucket(idx, bucket) {
    const name = categories.expense[idx];
    const before = snapshotCategoryConfig();
    bucketMap.wants = bucketMap.wants.filter(c => c !== name);
    if (bucket === 'wants') bucketMap.wants.push(name);
    rebuildDerivedCategories();
    await commitCategoryChange(before);
}

document.getElementById('cat-list').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx);
    if (btn.dataset.action === 'rename') renameCategory(idx);
    else if (btn.dataset.action === 'delete') deleteCategory(idx);
});
document.getElementById('cat-list').addEventListener('change', e => {
    const sel = e.target.closest('select[data-action="bucket"]');
    if (sel) changeCategoryBucket(parseInt(sel.dataset.idx), sel.value);
});
document.getElementById('cat-new-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); window.addCategoryFromModal(); }
});

// ==========================================
function populateCategoryDropdown(preselectedCategory = null) {
    const type = document.getElementById('type').value;
    const catSelect = document.getElementById('category');
    catSelect.innerHTML = '';
    if (categories[type]) {
        categories[type].forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            catSelect.appendChild(opt);
        });
    }
    if(preselectedCategory) {
        // หมวดเก่าที่ถูกลบออกจากรายการแล้ว: คงไว้เป็นตัวเลือกเพื่อไม่ให้ข้อมูลหายตอนแก้ไข
        if (![...catSelect.options].some(o => o.value === preselectedCategory)) {
            const opt = document.createElement('option');
            opt.value = preselectedCategory;
            opt.textContent = preselectedCategory;
            catSelect.appendChild(opt);
        }
        catSelect.value = preselectedCategory;
    }

    // สลับการแสดงผลตามประเภท: ถ้าเป็น "โอนเงินข้ามกระเป๋า" ให้ซ่อนหมวดหมู่ แล้วแสดงช่องเลือกกระเป๋าปลายทาง
    const isTransfer = type === 'transfer';
    catSelect.parentElement.classList.toggle('hidden', isTransfer);
    catSelect.required = !isTransfer;
    document.getElementById('to-wallet-group').classList.toggle('hidden', !isTransfer);
    document.getElementById('wallet-label').textContent = isTransfer ? '⬆️ โอนจากกระเป๋าเงิน' : 'กระเป๋าเงิน / จ่ายจาก';
}

function populateSubCategoryDropdown(preselectedCategory = null) {
    const type = document.getElementById('sub-type').value;
    const catSelect = document.getElementById('sub-category');
    catSelect.innerHTML = '';
    if (categories[type]) {
        categories[type].forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            catSelect.appendChild(opt);
        });
    }
    if(preselectedCategory) {
        // หมวดเก่าที่ถูกลบออกจากรายการแล้ว: คงไว้เป็นตัวเลือกเพื่อไม่ให้ข้อมูลหายตอนแก้ไข
        if (![...catSelect.options].some(o => o.value === preselectedCategory)) {
            const opt = document.createElement('option');
            opt.value = preselectedCategory;
            opt.textContent = preselectedCategory;
            catSelect.appendChild(opt);
        }
        catSelect.value = preselectedCategory;
    }
}

// ผูก Event Listener เมื่อมีการเปลี่ยนประเภท (รายรับ/รายจ่าย/เงินออม)
document.getElementById('type').addEventListener('change', () => populateCategoryDropdown());
document.getElementById('sub-type').addEventListener('change', () => populateSubCategoryDropdown());

function initFilters() {
    const yearSelect = document.getElementById('filter-year');
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 1; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === currentYear) opt.selected = true;
        yearSelect.appendChild(opt);
    }
    
    rebuildSearchCategoryFilter();

    const listWalletSelect = document.getElementById('list-wallet');
Object.keys(WALLET_LABELS).forEach(w => {
    const opt = document.createElement('option');
    opt.value = w;
    opt.textContent = WALLET_LABELS[w];
    listWalletSelect.appendChild(opt);
});
document.getElementById('list-wallet').addEventListener('change', updateSearchUI);

    document.getElementById('filter-year').addEventListener('change', updateDashboardUI);
    document.getElementById('filter-month').addEventListener('change', updateDashboardUI);
    document.getElementById('list-month').addEventListener('change', updateSearchUI);
    document.getElementById('list-category').addEventListener('change', updateSearchUI);
    document.getElementById('list-bucket').addEventListener('change', updateSearchUI);
    document.getElementById('list-month-to').addEventListener('change', updateSearchUI);
    document.getElementById('list-day-from').addEventListener('input', updateSearchUI);
    document.getElementById('list-day-to').addEventListener('input', updateSearchUI);
    document.getElementById('list-search').addEventListener('input', updateSearchUI);
}
// ตรวจสอบสถานะการล็อกอิน
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // ล็อกอินแล้ว -> ซ่อนหน้าล็อกอิน และโหลดข้อมูลจาก Firestore
        document.getElementById('login-overlay').classList.add('hidden');
        document.getElementById('global-loading').style.display = 'flex';
        await loadData(); 
    } else {
        // ยังไม่ได้ล็อกอิน -> แสดงหน้าล็อกอิน
        document.getElementById('login-overlay').classList.remove('hidden');
        document.getElementById('global-loading').style.display = 'none';
    }
});

// จัดการปุ่มกดล็อกอิน
document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-login');
    const err = document.getElementById('login-error');
    
    btn.textContent = 'กำลังตรวจสอบ...';
    btn.disabled = true;
    err.classList.add('hidden');

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // สำเร็จ: onAuthStateChanged จะทำงานต่อเอง
    } catch (error) {
        btn.textContent = 'ล็อกอินเข้าใช้งาน';
        btn.disabled = false;
        err.textContent = '❌ อีเมลหรือรหัสผ่านไม่ถูกต้อง';
        err.classList.remove('hidden');
    }
});
//report
window.printMonthlyReport = function() {
    const y = parseInt(document.getElementById('filter-year').value);
    const m = document.getElementById('filter-month').value;
    if (m === 'all') { alert('กรุณาเลือกเดือนที่ต้องการพิมพ์รายงานก่อนครับ'); return; }
    const mi = parseInt(m);
    const monthFull = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

    const data = allTransactions
        .filter(t => { const d = new Date(t.date); return d.getFullYear() === y && d.getMonth() === mi; })
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    let inc = 0, exp = 0, sav = 0;
    const catMap = {};
    data.forEach(t => {
        const v = parseFloat(t.amount);
        if (t.type === 'income') inc += v;
        else if (t.type === 'expense') { exp += v; catMap[t.category] = (catMap[t.category] || 0) + v; }
        else if (t.type === 'refund') { exp -= v; catMap[t.category] = (catMap[t.category] || 0) - v; }
        else if (t.type === 'savings') sav += v;
    });
    const catRows = Object.entries(catMap).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1])
        .map(([c, v]) => `<tr><td>${esc(c)}</td><td class="r">${formatMoney(v)}</td><td class="r">${exp > 0 ? (v / exp * 100).toFixed(1) : 0}%</td></tr>`).join('');

    const typeLabel = { income: 'รายรับ', expense: 'รายจ่าย', savings: 'เงินออม', refund: 'คืนเงิน', transfer: 'โอน', adjust: 'ปรับยอด' };
    const txRows = data.map(t => {
        const d = new Date(t.date);
        const dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        let wallet = WALLET_LABELS[t.wallet] || t.wallet || '';
        if (t.type === 'transfer') wallet += ' → ' + (WALLET_LABELS[t.toWallet] || t.toWallet || '');
        const cls = (t.type === 'income' || t.type === 'refund') ? 'g' : (t.type === 'expense' ? 'rd' : '');
        return `<tr><td>${dateStr}</td><td>${typeLabel[t.type] || t.type}</td><td>${esc(t.category)}</td><td>${esc(wallet)}</td><td>${esc(t.description)}</td><td class="r ${cls}">${formatMoney(t.amount)}</td></tr>`;
    }).join('');

    const html = `<!doctype html><html lang="th"><head><meta charset="UTF-8"><title>รายงาน ${monthFull[mi]} ${y}</title>
    <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
      body{font-family:'Prompt',sans-serif;color:#1e293b;margin:24px;font-size:12px}
      h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:20px 0 6px}
      .sum{display:flex;gap:12px;margin:12px 0}
      .box{flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:10px;text-align:center}
      .box b{display:block;font-size:16px;margin-top:4px}
      table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #e2e8f0;padding:5px 6px;text-align:left}
      th{background:#f1f5f9} .r{text-align:right} .g{color:#16a34a} .rd{color:#dc2626}
      @media print{body{margin:10mm} tr{page-break-inside:avoid}}
    </style></head><body>
    <h1>รายงานรายรับ-รายจ่าย</h1>
    <div>ประจำเดือน ${monthFull[mi]} ${y} • ${data.length} รายการ</div>
    <div class="sum">
      <div class="box">รายรับรวม<b class="g">${formatMoney(inc)}</b></div>
      <div class="box">รายจ่ายรวม<b class="rd">${formatMoney(exp)}</b></div>
      <div class="box">เงินออมรวม<b>${formatMoney(sav)}</b></div>
      <div class="box">คงเหลือสุทธิ<b>${formatMoney(inc - exp - sav)}</b></div>
    </div>
    <h2>สรุปรายจ่ายแยกหมวดหมู่</h2>
    <table><tr><th>หมวดหมู่</th><th class="r">จำนวนเงิน</th><th class="r">สัดส่วน</th></tr>${catRows || '<tr><td colspan="3">ไม่มีข้อมูล</td></tr>'}</table>
    <h2>รายการทั้งหมด</h2>
    <table><tr><th>วันที่</th><th>ประเภท</th><th>หมวดหมู่</th><th>กระเป๋า</th><th>หมายเหตุ</th><th class="r">จำนวนเงิน</th></tr>${txRows || '<tr><td colspan="6">ไม่มีรายการ</td></tr>'}</table>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตป๊อปอัปแล้วลองใหม่ครับ'); return; }
    w.document.write(html);
    w.document.close();
    w.onload = () => setTimeout(() => w.print(), 400);
};

// ส่วนของ window.onload
window.onload = function() {
    document.getElementById('date').valueAsDate = new Date();
    initFilters(); 
    // เติมตัวเลือกหมวดหมู่ตั้งแต่เริ่ม (เดิมช่องหมวดหมู่ของบิลประจำจะว่างจนกว่าจะเปลี่ยนประเภท)
    populateCategoryDropdown();
    populateSubCategoryDropdown();
    toggleSubFrequencyFields();
    // ไม่ต้องเรียก loadData() ตรงนี้แล้ว เพราะ onAuthStateChanged จะจัดการให้
    switchTab('overview'); 
};