// File: history.js — History page data & chart handler (modular Firebase SDK)

import { firebaseConfig } from './config.js';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import * as XLSX from 'xlsx';
import './style.css';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Auth guard: redirect to login if not authenticated
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = '/login.html';
  }
});

// -------------------------------------------------------------
// Load and display travel history data
// -------------------------------------------------------------
function loadHistoryData() {
  const tbody = document.getElementById('history-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Đang tải dữ liệu...</td></tr>`;

  get(ref(db, 'tracker/history')).then((snapshot) => {
    tbody.innerHTML = '';
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        const row = child.val();
        const lat = row.lat !== undefined ? row.lat : '-';
        const lng = row.lng !== undefined ? row.lng : '-';
        const rawTime = row.timestamp || '-';

        tbody.innerHTML += `<tr>
          <td>${rawTime}</td>
          <td>${lat}</td>
          <td>${lng}</td>
        </tr>`;
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: #8e8e93;">Chưa có dữ liệu lịch sử di chuyển.</td></tr>`;
    }
  }).catch((err) => {
    console.error('Lỗi tải lịch sử di chuyển:', err);
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: red;">Lỗi tải dữ liệu.</td></tr>`;
  });
}

// -------------------------------------------------------------
// Load and display fall incident history
// -------------------------------------------------------------
function loadFallData() {
  const tbody = document.getElementById('fall-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Đang tải dữ liệu...</td></tr>`;

  get(ref(db, 'tracker/fall_history')).then((snapshot) => {
    tbody.innerHTML = '';
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        const row = child.val();
        tbody.innerHTML += `<tr>
          <td>${row.timestamp || '-'}</td>
          <td>${row.lat || '-'}</td>
          <td>${row.lng || '-'}</td>
        </tr>`;
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: #8e8e93;">Chưa có ghi nhận sự cố nào.</td></tr>`;
    }
  }).catch((err) => {
    console.error('Lỗi tải lịch sử sự cố:', err);
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: red;">Lỗi tải dữ liệu.</td></tr>`;
  });
}

// -------------------------------------------------------------
// Excel export via SheetJS
// -------------------------------------------------------------
const exportExcelBtn = document.getElementById('export-excel-btn');
if (exportExcelBtn) {
  exportExcelBtn.addEventListener('click', () => {
    const table = document.getElementById('history-table');
    if (!table) return;
    const wb = XLSX.utils.table_to_book(table, { sheet: 'Lộ Trình' });
    XLSX.writeFile(wb, 'Lich_Su_Di_Chuyen.xlsx');
  });
}

const exportFallExcelBtn = document.getElementById('export-fall-excel-btn');
if (exportFallExcelBtn) {
  exportFallExcelBtn.addEventListener('click', () => {
    const table = document.getElementById('fall-table');
    if (!table) return;
    const wb = XLSX.utils.table_to_book(table, { sheet: 'Té Ngã' });
    XLSX.writeFile(wb, 'Lich_Su_Te_Nga.xlsx');
  });
}

// -------------------------------------------------------------
// Back button → Dashboard
// -------------------------------------------------------------
const backBtn = document.getElementById('back-btn');
if (backBtn) {
  backBtn.addEventListener('click', () => {
    window.location.href = '/dashboard.html';
  });
}

// -------------------------------------------------------------
// Dark mode toggle
// -------------------------------------------------------------
const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    themeToggle.innerText = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
  });
}

// -------------------------------------------------------------
// Load data on page ready
// -------------------------------------------------------------
window.onload = () => {
  loadHistoryData();
  loadFallData();
};
