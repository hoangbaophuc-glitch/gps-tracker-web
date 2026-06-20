import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import 'leaflet-routing-machine';
import './style.css';

import { firebaseConfig, i18n, appVersion } from './config.js';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, get } from "firebase/database";
import { getAuth, signOut, onAuthStateChanged } from "firebase/auth";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { initializeDataService, loadFallData, exportFailsToExcel } from './dataService.js';

const getEl = id => document.getElementById(id);

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

L.Routing.Localization = L.Routing.Localization || {};
L.Routing.Localization['vi'] = {
    directions: {
        N: 'bắc', NE: 'đông bắc', E: 'đông', SE: 'đông nam', S: 'nam', SW: 'tây nam', W: 'tây', NW: 'tây bắc',
        SlightRight: 'Hơi rẽ phải', Right: 'Rẽ phải', SharpRight: 'Rẽ ngoặt phải',
        SlightLeft: 'Hơi rẽ trái', Left: 'Rẽ trái', SharpLeft: 'Rẽ ngoặt trái',
        Uturn: 'Quay đầu', Continue: 'Chạy tiếp', Head: 'Đi về hướng',
        DestinationReached: 'Đã đến đích', Roundabout: 'Đi vào vòng xoay',
        WaypointReached: 'Đã đến điểm dừng'
    },
    formatOrder: function(n) { return n; }
};

let currentLang = 'vi';

// Wake lock
let wakeLock = null;
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Màn hình sẽ luôn sáng để nhận cảnh báo!');
        }
    } catch (err) {
        console.error(`Lỗi WakeLock: ${err.name}, ${err.message}`);
    }
}

document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
    }
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const messaging = getMessaging(app);
initializeDataService(db);

async function setupFCM() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification permission granted.');
            const token = await getToken(messaging, { vapidKey: 'BBb6jJYU9g3GhTnTIgcftV_52w5_zx8ZnSbuEpF8q8RSl54IdvEY8kud5LpCLZNKrUI9qRWXTtwc2uvObLJffaU' });
            if (token) console.log('FCM Token:', token);
            else console.log('Không thể lấy token.');
        } else {
            console.log('Không được cấp quyền nhận thông báo.');
        }
    } catch (err) { console.error('Lỗi khi lấy token FCM: ', err); }
}

onMessage(messaging, (payload) => {
    console.log('Đã nhận tin nhắn (foreground): ', payload);
    const { title, body } = payload.notification || {};
    if (title) new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/564/564276.png' });
});

const nameMappings = {
    'trungkien': 'Trung Kien',
    'dinhkhang': 'Dinh Khang',
    'thanhtu': 'Thanh Tu',
    'baophuc': 'Bao Phuc',
    'tranhuy': 'Tran Huy',
};

function getFormattedName(user) {
    if (!user) return '';
    if (user.displayName) return user.displayName;
    if (user.email) {
        const username = user.email.split('@')[0];
        if (nameMappings[username]) return nameMappings[username];
        return username.charAt(0).toUpperCase() + username.slice(1);
    }
    return '';
}

let map = null;
let marker = null;
let esp32Pos = [10.762622, 106.660172];
let routingControl = null;
let offlineTimer;
let isFalling = false;
let currentSpeedVal = 0;

// Auth guard: redirect to login if not authenticated
onAuthStateChanged(auth, (user) => {
    const welcomeEl = getEl('welcome-text');
    if (user) {
        const prefix = currentLang === 'vi' ? "Xin chào, " : "Hello, ";
        if (welcomeEl) welcomeEl.innerText = prefix + getFormattedName(user) + "!";
        if (map) setTimeout(() => map.invalidateSize(), 400);
        requestWakeLock();
        setupFCM();
    } else {
        // Not logged in → redirect to login page
        window.location.href = '/login.html';
    }
});

// Logout handler
const logoutBtn = getEl('logout-btn');
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        try {
            await signOut(auth);
            window.location.href = '/login.html';
        } catch (error) {
            console.error("Logout error:", error);
        }
    }
}

function updateUI() {
    document.querySelectorAll('[data-key]').forEach(el => {
        const key = el.getAttribute('data-key');
        if (i18n[currentLang][key]) {
            if (el.tagName === 'OPTION') el.text = i18n[currentLang][key];
            else el.innerHTML = i18n[currentLang][key];
        }
    });
    const langToggle = getEl('lang-toggle'); if (langToggle) langToggle.innerText = currentLang === 'vi' ? 'EN' : 'VI';
    const user = auth.currentUser;
    const welcomeEl = getEl('welcome-text'); if (user && welcomeEl) { const prefix = currentLang === 'vi' ? "Xin chào, " : "Hello, "; welcomeEl.innerText = prefix + getFormattedName(user) + "!"; }
    const dwellEl = getEl('dwell-val'); if (dwellEl) {
        const dv = dwellEl.innerText; if (dv === "Moving" || dv === "Đang di chuyển") dwellEl.innerText = currentLang === 'vi' ? "Đang di chuyển" : "Moving";
    }
    if (routingControl) startNavigation();
}

// Modal handlers (only if present)
let infoModal = getEl('info-modal'); if (getEl('open-info')) getEl('open-info').onclick = () => { if (infoModal) infoModal.style.display = 'flex'; };
if (getEl('close-info')) getEl('close-info').onclick = () => { if (infoModal) infoModal.style.display = 'none'; };

let fallModal = getEl('fall-modal'); if (getEl('fall-btn')) getEl('fall-btn').onclick = () => { if (fallModal) { fallModal.style.display = 'flex'; loadFallData(); } };
if (getEl('close-fall')) getEl('close-fall').onclick = () => { if (fallModal) fallModal.style.display = 'none'; };

window.onclick = (e) => {
    if (infoModal && e.target == infoModal) infoModal.style.display = 'none';
    if (fallModal && e.target == fallModal) fallModal.style.display = 'none';
}

// Initialize map only if #map exists on the page
if (getEl('map')) {
    map = L.map('map').setView([10.762622, 106.660172], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker(esp32Pos, { icon: L.divIcon({ html: `<div style="background:var(--primary, #71A5DE); width:16px; height:16px; border-radius:50%; border:2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>`, className: '', iconSize:[20,20] }) }).addTo(map);
}

function startNavigation() {
    if (!map) return;
    navigator.geolocation.getCurrentPosition(pos => {
        if (routingControl) map.removeControl(routingControl);
        const modeEl = getEl('travel-mode'); if (!modeEl) return;
        const mode = modeEl.value;
        let routeColor = '#71A5DE';
        if (mode === 'driving') routeColor = '#E05252'; else if (mode === 'cycling') routeColor = '#71A5DE'; else if (mode === 'walking') routeColor = '#4CAF7D';

        routingControl = L.Routing.control({
            waypoints: [L.latLng(pos.coords.latitude, pos.coords.longitude), L.latLng(esp32Pos[0], esp32Pos[1])],
            router: L.Routing.osrmv1({ serviceUrl: `https://router.project-osrm.org/route/v1`, profile: mode, language: currentLang }),
            lineOptions: { styles: [{ color: routeColor, opacity: 0.8, weight: 6 }] }, addWaypoints: false,
            formatter: new L.Routing.Formatter({ language: currentLang, formatTime: function(t) {
                const m = Math.round(t / 60); const unitMin = currentLang === 'vi' ? ' phút' : ' min'; const unitHour = currentLang === 'vi' ? ' giờ ' : ' h ';
                if (m === 0) return currentLang === 'vi' ? 'Vừa tới' : 'Arrived'; if (m < 60) return m + unitMin;
                return Math.floor(m / 60) + unitHour + (m % 60) + unitMin;
            }})
        });

        routingControl.on('routesfound', function(e) {
            const routes = e.routes; let minsPerKm = 3.5; if (mode === 'driving') minsPerKm = 5; if (mode === 'walking') minsPerKm = 15;
            const secsPerMeter = (minsPerKm * 60) / 1000;
            routes.forEach(route => {
                route.summary.totalTime = route.summary.totalDistance * secsPerMeter;
                if (route.instructions) {
                    route.instructions.forEach(inst => {
                        inst.time = inst.distance * secsPerMeter;
                        if (currentLang === 'en' && inst.name) {
                            let n = inst.name;
                            if (n.indexOf('Đường ') === 0) n = n.replace('Đường ', '') + ' Street';
                            else if (n.indexOf('Hẻm ') === 0) n = n.replace('Hẻm ', 'Alley ');
                            else if (n.indexOf('Đại lộ ') === 0) n = n.replace('Đại lộ ', '') + ' Avenue';
                            else if (n.indexOf('Phố ') === 0) n = n.replace('Phố ', '') + ' Street';
                            else if (n.indexOf('Cầu ') === 0) n = n.replace('Cầu ', '') + ' Bridge';
                            else if (n.indexOf('Vòng xoay ') === 0) n = n.replace('Vòng xoay ', 'Roundabout ');
                            n = n.replace(/Số /g, 'No. ');
                            inst.name = n; inst.road = n;
                        }
                    });
                }
            });
        });

        routingControl.addTo(map);
    });
}

if (getEl('find-way')) getEl('find-way').onclick = startNavigation;
if (getEl('lang-toggle')) getEl('lang-toggle').onclick = () => { currentLang = currentLang === 'vi' ? 'en' : 'vi'; updateUI(); };
if (getEl('theme-toggle')) getEl('theme-toggle').onclick = () => { document.body.classList.toggle('dark-mode'); if (getEl('theme-toggle')) getEl('theme-toggle').innerText = document.body.classList.contains('dark-mode') ? '☀️' : '🌙'; };
if (getEl('buzzer-btn')) getEl('buzzer-btn').onclick = () => { set(ref(db, 'tracker/action/ring'), true); alert(currentLang === 'vi' ? "Đã gửi tín hiệu bật còi tìm phương tiện!" : "Sent buzzer trigger to vehicle!"); };

let lastLat = null, lastLng = null; let stayStartTime = null;
function checkDwellTime(lat, lng) {
    if (!getEl('dwell-val')) return;
    if (lastLat === null || lastLng === null) { lastLat = lat; lastLng = lng; stayStartTime = Date.now(); return; }
    const threshold = 0.00015; const distance = Math.sqrt(Math.pow(lat - lastLat, 2) + Math.pow(lng - lastLng, 2));
    if (distance < threshold) {
        const diffSecs = Math.floor((Date.now() - stayStartTime) / 1000);
        const h = String(Math.floor(diffSecs / 3600)).padStart(2, '0');
        const m = String(Math.floor((diffSecs % 3600) / 60)).padStart(2, '0');
        const s = String(diffSecs % 60).padStart(2, '0');
        getEl('dwell-val').innerText = `${h}:${m}:${s}`;
    } else {
        lastLat = lat; lastLng = lng; stayStartTime = Date.now(); getEl('dwell-val').innerText = currentLang === 'vi' ? "Đang di chuyển" : "Moving";
    }
}

onValue(ref(db, 'tracker/live'), (snapshot) => {
    const data = snapshot.val();
    const connDot = getEl('connection-dot');
    if (!data) { if (connDot) connDot.classList.remove('online'); return; }
    if (connDot) connDot.classList.add('online');
    clearTimeout(offlineTimer);
    offlineTimer = setTimeout(() => { if (connDot) connDot.classList.remove('online'); }, 5000);
    if (data.gps && data.gps.lat && data.gps.lng) {
        esp32Pos = [data.gps.lat, data.gps.lng]; if (marker) marker.setLatLng(esp32Pos);
        currentSpeedVal = data.gps.speed || 0; checkDwellTime(data.gps.lat, data.gps.lng);
    }
    if (data.mpu) {
        const mpuX = data.mpu.gForceX || 0; const mpuY = data.mpu.gForceY || 0;
        const tiltCard = getEl('tilt-warning'), tiltText = getEl('tilt-text');
        if ((tiltCard && tiltText) && (Math.abs(mpuX) > 0.7 || Math.abs(mpuY) > 0.7)) {
            tiltCard.classList.add('alert-danger'); tiltText.innerText = i18n[currentLang].st_fall; document.body.classList.add('falling-alert');
            if (!isFalling) {
                isFalling = true;
                if ("Notification" in window && Notification.permission === "granted") {
                    const msgTitle = currentLang === 'vi' ? 'CẢNH BÁO TỪ GPS TRACKER!' : 'GPS TRACKER ALERT!';
                    const msgBody = currentLang === 'vi' ? 'Hệ thống vừa phát hiện sự cố té ngã/đổ xe!' : 'A fall/crash has been detected!';
                    new Notification(msgTitle, { body: msgBody, icon: 'https://cdn-icons-png.flaticon.com/512/564/564276.png', vibrate: [200,100,200,100,200,100,200] });
                }
                const timeStr = new Date().toLocaleString('vi-VN');
                set(ref(db, 'tracker/fall_history/' + Date.now()), { timestamp: timeStr, lat: esp32Pos[0], lng: esp32Pos[1] });
            }
        } else {
            if (tiltCard) tiltCard.classList.remove('alert-danger'); if (tiltText) tiltText.innerText = i18n[currentLang].st_ok; document.body.classList.remove('falling-alert'); isFalling = false;
        }
    }
});

let lastSavedLat = null; let lastSavedLng = null;
setInterval(() => {
    if (auth.currentUser && esp32Pos[0]) {
        if (currentSpeedVal > 1 || lastSavedLat !== esp32Pos[0] || lastSavedLng !== esp32Pos[1]) {
            const timeStr = new Date().toLocaleString('vi-VN');
            set(ref(db, 'tracker/history/' + Date.now()), { timestamp: timeStr, lat: esp32Pos[0], lng: esp32Pos[1] });
            lastSavedLat = esp32Pos[0]; lastSavedLng = esp32Pos[1];
        }
    }
}, 30000);

const exportFallBtn = getEl('export-fall-excel-btn'); if (exportFallBtn) exportFallBtn.onclick = exportFailsToExcel;

// Hiển thị phiên bản ứng dụng lên giao diện
document.addEventListener('DOMContentLoaded', () => { 
    const versionDisplay = document.getElementById('app-version-display');
    if (versionDisplay) {
        versionDisplay.innerText = 'Version v' + appVersion; 
    }
});
