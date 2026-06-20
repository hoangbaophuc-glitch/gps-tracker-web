// File: history.js — History page data & chart handler (modular Firebase SDK)

import { firebaseConfig } from './config.js';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import Chart from 'chart.js/auto';
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

let speedChart = null;

// -------------------------------------------------------------
// Load and display travel history data + draw speed chart
// -------------------------------------------------------------
function loadHistoryData() {
  const tbody = document.getElementById('history-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Đang tải dữ liệu...</td></tr>`;

  get(ref(db, 'tracker/history')).then((snapshot) => {
    tbody.innerHTML = '';
    if (snapshot.exists()) {
      const chartLabels = [];
      const chartData = [];

      snapshot.forEach((child) => {
        const row = child.val();
        const lat = row.lat !== undefined ? row.lat : '-';
        const lng = row.lng !== undefined ? row.lng : '-';
        const speed = row.speed !== undefined ? parseFloat(row.speed) : 0;
        const rawTime = row.timestamp || '-';

        // Format timestamp for chart X-axis label
        let chartTime = rawTime;
        if (rawTime.includes(', ')) {
          const parts = rawTime.split(', ');
          chartTime = parts[1] || parts[0];
        } else if (rawTime.includes(' ')) {
          const parts = rawTime.split(' ');
          chartTime = parts[1] || parts[0];
        }

        tbody.innerHTML += `<tr>
          <td>${rawTime}</td>
          <td>${lat}</td>
          <td>${lng}</td>
          <td>${speed.toFixed(1)}</td>
        </tr>`;

        chartLabels.push(chartTime);
        chartData.push(speed.toFixed(1));
      });

      drawChart(chartLabels, chartData);
    } else {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: #8e8e93;">Chưa có dữ liệu lịch sử di chuyển.</td></tr>`;
    }
  }).catch((err) => {
    console.error('Lỗi tải lịch sử di chuyển:', err);
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: red;">Lỗi tải dữ liệu.</td></tr>`;
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
// Draw Chart.js line chart for speed over time
// -------------------------------------------------------------
function drawChart(labels, dataPoints) {
  const canvas = document.getElementById('speedChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (speedChart) {
    speedChart.destroy();
  }

  speedChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Vận tốc (km/h)',
        data: dataPoints,
        borderColor: '#71A5DE',
        backgroundColor: 'rgba(113, 165, 222, 0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: '#71A5DE',
        pointBorderColor: '#ffffff',
        pointRadius: labels.length > 50 ? 0 : 3.5,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: 'BIỂU ĐỒ BIẾN THIÊN VẬN TỐC THEO THỜI GIAN THỰC',
          color: '#2c3e50',
          font: {
            size: 14,
            weight: 'bold',
            family: 'system-ui, -apple-system, sans-serif'
          },
          padding: { bottom: 15 }
        },
        legend: { display: false }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Thời gian (Giờ:Phút:Giây)',
            color: '#7f8c8d',
            font: { size: 11, weight: 'bold' }
          },
          grid: { display: false },
          ticks: { color: '#7f8c8d', maxTicksLimit: 10 }
        },
        y: {
          min: 0,
          max: 60,
          title: {
            display: true,
            text: 'Vận tốc (km/h)',
            color: '#7f8c8d',
            font: { size: 11, weight: 'bold' }
          },
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { color: '#7f8c8d', stepSize: 10 }
        }
      }
    }
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
