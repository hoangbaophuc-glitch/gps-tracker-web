import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import 'leaflet-routing-machine';
import './style.css';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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
    
    // Sync 3D telemetry and hover labels on language change
    const telemetryTrunk = document.getElementById('telemetry-trunk');
    if (telemetryTrunk) {
        telemetryTrunk.innerText = trunkOpen ? (currentLang === 'vi' ? 'Mở' : 'Open') : (currentLang === 'vi' ? 'Đóng' : 'Closed');
    }
    const telemetryStatus = document.getElementById('telemetry-status');
    if (telemetryStatus) {
        telemetryStatus.innerText = isFalling ? (currentLang === 'vi' ? 'ĐỔ NGÃ!' : 'FALLEN!') : (currentLang === 'vi' ? 'Cân bằng' : 'Balanced');
    }
    const hoverTip = document.getElementById('hover-tip-text');
    if (hoverTip) {
        hoverTip.innerText = currentLang === 'vi' ? '👉 Nhấp chuột trái & kéo để xoay xe' : '👉 Left-click & drag to rotate vehicle';
    }
    const circName = document.getElementById('circuit-comp-name');
    if (circName && (circName.innerText === 'Chọn linh kiện' || circName.innerText === 'Select Component' || circName.innerText === '')) {
        circName.innerText = currentLang === 'vi' ? 'Chọn linh kiện' : 'Select Component';
    }
    const circDesc = document.getElementById('circuit-comp-desc');
    if (circDesc && (circDesc.innerText.includes('Di chuột') || circDesc.innerText.includes('Hover over') || circDesc.innerText.includes('Nhấp chọn') || circDesc.innerText.includes('Click on') || circDesc.innerText === '')) {
        circDesc.innerText = currentLang === 'vi' ? 'Nhấp chọn linh kiện trên sơ đồ để xem vai trò và thông tin kết nối chi tiết.' : 'Click on a component in the schematic to view its role and detailed connection pinouts.';
    }
    
    if (routingControl) startNavigation();
}

// Modal handlers (only if present)
let infoModal = getEl('info-modal'); if (getEl('open-info')) getEl('open-info').onclick = () => { if (infoModal) infoModal.style.display = 'flex'; };
if (getEl('close-info')) getEl('close-info').onclick = () => { if (infoModal) infoModal.style.display = 'none'; };

let fallModal = getEl('fall-modal'); if (getEl('fall-btn')) getEl('fall-btn').onclick = () => { if (fallModal) { fallModal.style.display = 'flex'; loadFallData(); } };
if (getEl('close-fall')) getEl('close-fall').onclick = () => { if (fallModal) fallModal.style.display = 'none'; };

window.addEventListener('click', (e) => {
    if (infoModal && e.target == infoModal) infoModal.style.display = 'none';
    if (fallModal && e.target == fallModal) fallModal.style.display = 'none';
});

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
if (getEl('theme-toggle')) getEl('theme-toggle').onclick = () => { 
    document.body.classList.toggle('dark-mode'); 
    if (getEl('theme-toggle')) getEl('theme-toggle').innerText = document.body.classList.contains('dark-mode') ? '☀️' : '🌙'; 
    if (typeof update3DTheme === 'function') update3DTheme();
};
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

        // Update 3D telemetry
    }
    if (data.mpu) {
        const mpuX = data.mpu.gForceX || 0; const mpuY = data.mpu.gForceY || 0;
        
        // Compute tilt angle in radians
        const angle = Math.atan2(mpuX, 1.0);
        currentTiltVal = angle;

        const telemetryAngle = document.getElementById('telemetry-angle');
        if (telemetryAngle) {
            telemetryAngle.innerText = Math.abs(angle * 180 / Math.PI).toFixed(1) + '°';
        }

        const telemetryStatus = document.getElementById('telemetry-status');
        if (telemetryStatus) {
            telemetryStatus.innerText = isFalling ? (currentLang === 'vi' ? 'ĐỔ NGÃ!' : 'FALLEN!') : (currentLang === 'vi' ? 'Cân bằng' : 'Balanced');
            telemetryStatus.className = 'telemetry-val ' + (isFalling ? 'font-danger' : 'font-success');
        }

        const tiltCard = getEl('tilt-warning'), tiltText = getEl('tilt-text');
        if ((tiltCard && tiltText) && (Math.abs(mpuX) > 0.7 || Math.abs(mpuY) > 0.7)) {
            tiltCard.classList.add('alert-danger'); tiltText.innerText = i18n[currentLang].st_fall; document.body.classList.add('falling-alert');
            
            const prevFalling = isFalling;
            isFalling = true;
            
            if (!prevFalling) {
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

    // Khởi tạo tab chuyển đổi và sơ đồ mạch tương tác
    setupTabSwitching();
    setupCircuitSchematicInteractions();
});

// ==========================================
// --- 3D ENGINE & SCHEMATIC INTEGRATION ---
// ==========================================

// --- 3D ENGINE VARIABLES ---
let scene, camera, renderer, controls;
let motorcycleGroup, trunkLidGroup, iotDeviceMesh;
let trunkOpen = false;
let targetTrunkRotation = 0;
let currentTrunkRotation = 0;
let is3DInitialized = false;
let animationFrameId = null;
let currentTiltVal = 0;

// Khởi động Engine 3D
function init3D() {
    if (is3DInitialized) return;
    
    const container = document.getElementById('canvas-3d');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    
    // 1. Tạo Scene
    const isDark = document.body.classList.contains('dark-mode');
    const bgColor = isDark ? 0x121620 : 0xf8f9fb;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.FogExp2(bgColor, 0.05);

    // 2. Tạo Camera
    camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 100);
    camera.position.set(5, 3, 6);

    // 3. Tạo Renderer
    renderer = new THREE.WebGLRenderer({ canvas: container, antialias: true });
    renderer.setSize(rect.width, rect.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;

    // 4. Tạo Controls (Điều khiển xoay camera)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Không xoay xuống dưới sàn
    controls.minDistance = 3;
    controls.maxDistance = 15;

    // 5. Thêm Grid & Mặt sàn (Đã loại bỏ theo yêu cầu để chỉ hiển thị xe)

    // 6. Ánh sáng
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.85);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x83b0e1, 0.8);
    rimLight.position.set(-6, 5, -5);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-2, -5, 2);
    scene.add(fillLight);

    const pointLight = new THREE.PointLight(0x5b8fc8, 1.0, 10);
    pointLight.position.set(-1.2, 2.0, 0); // Đèn LED xanh phía trên cốp xe
    scene.add(pointLight);

    // 7. Dựng mô hình 3D xe máy
    createMotorcycleModel();

    // 8. Đăng ký sự kiện thay đổi kích thước cửa sổ
    window.addEventListener('resize', resize3D);
    
    // 9. Raycasting xử lý sự kiện nhấp chuột
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    container.addEventListener('click', (e) => {
        const canvasRect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
        mouse.y = -((e.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        const clickable = [trunkLidGroup, iotDeviceMesh];
        const intersects = raycaster.intersectObjects(clickable, true);

        if (intersects.length > 0) {
            let clickedObj = intersects[0].object;
            
            // Kiểm tra xem nhấp vào cốp (hoặc yên xe thuộc group cốp) hay thiết bị IoT
            let isTrunk = false;
            let temp = clickedObj;
            while (temp) {
                if (temp === trunkLidGroup) { isTrunk = true; break; }
                temp = temp.parent;
            }

            if (isTrunk) {
                // Đảo trạng thái mở cốp
                trunkOpen = !trunkOpen;
                targetTrunkRotation = trunkOpen ? -Math.PI / 2.2 : 0;
                
                const trunkText = trunkOpen ? (currentLang === 'vi' ? 'Mở' : 'Open') : (currentLang === 'vi' ? 'Đóng' : 'Closed');
                document.getElementById('telemetry-trunk').innerText = trunkText;
                document.getElementById('telemetry-trunk').className = 'telemetry-val ' + (trunkOpen ? 'font-success' : 'font-warning');
            } else if (clickedObj === iotDeviceMesh) {
                // Chỉ mở được mạch điện khi cốp đã mở
                if (trunkOpen) {
                    const circuitModal = document.getElementById('circuit-modal');
                    if (circuitModal) circuitModal.style.display = 'flex';
                }
            }
        }
    });

    is3DInitialized = true;
}

function resize3D() {
    if (!is3DInitialized || !renderer || !camera) return;
    const container = document.getElementById('canvas-3d').parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height);
}

function update3DTheme() {
    if (!scene || !is3DInitialized) return;
    const isDark = document.body.classList.contains('dark-mode');
    const bgColor = isDark ? 0x121620 : 0xf8f9fb;
    const floorColor = isDark ? 0x1a2030 : 0xffffff;
    
    scene.background.setHex(bgColor);
    if (scene.fog) {
        scene.fog.color.setHex(bgColor);
    }
    
    scene.traverse((child) => {
        if (child.name === 'floorMesh' && child.material) {
            child.material.color.setHex(floorColor);
        }
    });
}

// Vòng lặp render mô hình
function animate() {
    if (!is3DInitialized) return;
    animationFrameId = requestAnimationFrame(animate);

    // Xoay cốp xe trơn tru (nội suy)
    currentTrunkRotation += (targetTrunkRotation - currentTrunkRotation) * 0.1;
    if (trunkLidGroup) {
        trunkLidGroup.rotation.z = currentTrunkRotation; // xoay quanh trục khớp Z
    }

    // Nhấp nháy đèn LED trên thiết bị IoT
    if (iotDeviceMesh && iotDeviceMesh.parent) {
        const led = iotDeviceMesh.parent.children[1];
        if (led && led.material) {
            led.material.opacity = 0.3 + Math.abs(Math.sin(Date.now() * 0.005)) * 0.7;
            led.material.transparent = true;
        }
    }

    // Nghiêng xe máy thời gian thực theo cảm biến MPU6050
    if (motorcycleGroup) {
        let targetLean = currentTiltVal;
        
        // Nếu đổ ngã, nghiêng xe nằm hẳn ra đất (góc nghiêng khoảng 70 độ)
        if (isFalling) {
            targetLean = 1.2; 
        }
        
        motorcycleGroup.rotation.z += (targetLean - motorcycleGroup.rotation.z) * 0.1;
    }

    controls.update();
    renderer.render(scene, camera);
}

// Xây dựng xe máy 3D bằng các khối nguyên bản
function createMotorcycleModel() {
    motorcycleGroup = new THREE.Group();

    // 1. Khung xe (Kim loại chrome)
    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x8e8e93,
        metalness: 0.9,
        roughness: 0.15
    });
    const chromeMat = new THREE.MeshStandardMaterial({
        color: 0xd1d1d6,
        metalness: 0.95,
        roughness: 0.08
    });
    
    // Khung sườn chịu lực chính chạy ngang dưới gầm
    const mainFrameGeom = new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8);
    const mainFrame = new THREE.Mesh(mainFrameGeom, frameMaterial);
    mainFrame.rotation.z = Math.PI / 2;
    mainFrame.position.set(-0.2, 0.65, 0);
    motorcycleGroup.add(mainFrame);

    // Cột chạc ba cổ xe (Fork Column) nghiêng về sau nối bánh trước lên ghi đông (ăn khớp hoàn toàn)
    const forkColGeom = new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8);
    const forkCol = new THREE.Mesh(forkColGeom, frameMaterial);
    forkCol.rotation.z = 0.38; // Nghiêng 21.8 độ về phía sau để khớp nối ghi đông
    forkCol.position.set(1.6, 1.35, 0);
    motorcycleGroup.add(forkCol);

    // 2. Bánh xe mâm đúc 5 chấu (5-Spoke Star Wheels) giống SH/Vision 70%
    const tireMaterial = new THREE.MeshStandardMaterial({
        color: 0x1c1c1e,
        roughness: 0.9,
        metalness: 0.1
    });
    const hubMaterial = new THREE.MeshStandardMaterial({
        color: 0xd1d1d6,
        metalness: 0.8,
        roughness: 0.2
    });
    const brakeDiscMaterial = new THREE.MeshStandardMaterial({
        color: 0xa9a9a9,
        metalness: 0.9,
        roughness: 0.15
    });
    const caliperMaterial = new THREE.MeshStandardMaterial({
        color: 0xff3b30, // Heo Brembo đỏ nổi bật
        metalness: 0.5,
        roughness: 0.2
    });

    // Hàm tạo cụm bánh xe 5 chấu ngôi sao chân thực, hướng nan hướng tâm đối xứng hoàn hảo
    function createDetailedWheel() {
        const wheelGroup = new THREE.Group();
        
        // Lốp xe dạng tròn Torus
        const tireGeom = new THREE.TorusGeometry(0.48, 0.12, 16, 100);
        const tire = new THREE.Mesh(tireGeom, tireMaterial);
        wheelGroup.add(tire);

        // Trục bánh xe (Hub)
        const hubGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.24, 12);
        const hub = new THREE.Mesh(hubGeom, hubMaterial);
        hub.rotation.x = Math.PI / 2;
        wheelGroup.add(hub);

        // 5 nan mâm đúc ngôi sao (5-Spoke Star alloy design) - thiết lập nhóm xoay hướng tâm chính xác
        const spokeGeom = new THREE.BoxGeometry(0.04, 0.36, 0.06);
        for (let i = 0; i < 5; i++) {
            const spokeGroup = new THREE.Group();
            spokeGroup.rotation.z = (i * 2 * Math.PI) / 5;
            const spoke = new THREE.Mesh(spokeGeom, hubMaterial);
            spoke.position.y = 0.22; // Dịch chuyển căm ra phía ngoài từ tâm trục bánh xe hướng tâm chuẩn xác
            spokeGroup.add(spoke);
            wheelGroup.add(spokeGroup);
        }

        // Đĩa phanh kim loại
        const discGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.015, 24);
        const disc = new THREE.Mesh(discGeom, brakeDiscMaterial);
        disc.rotation.x = Math.PI / 2;
        disc.position.z = 0.07;
        wheelGroup.add(disc);

        // Cùm phanh Brembo đỏ thể thao
        const caliperGeom = new THREE.BoxGeometry(0.09, 0.15, 0.08);
        const caliper = new THREE.Mesh(caliperGeom, caliperMaterial);
        caliper.position.set(0.24, 0.24, 0.08);
        wheelGroup.add(caliper);

        return wheelGroup;
    }

    // Bánh trước
    const frontWheel = createDetailedWheel();
    frontWheel.position.set(1.9, 0.6, 0); // Di chuyển lại gần hơn để khớp thiết kế yếm chắn gió
    motorcycleGroup.add(frontWheel);

    // Bánh sau
    const rearWheel = createDetailedWheel();
    rearWheel.position.set(-2.0, 0.6, 0);
    motorcycleGroup.add(rearWheel);

    // Phuộc nhún trước (Struts) - nghiêng song song với cổ xe ăn khớp trục bánh trước
    const strutGeom = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8);
    const leftStrut = new THREE.Mesh(strutGeom, frameMaterial);
    leftStrut.position.set(1.75, 0.9, 0.22);
    leftStrut.rotation.z = 0.38;
    const rightStrut = new THREE.Mesh(strutGeom, frameMaterial);
    rightStrut.position.set(1.75, 0.9, -0.22);
    rightStrut.rotation.z = 0.38;
    motorcycleGroup.add(leftStrut, rightStrut);

    // 3. Vỏ sườn xe & Dàn áo xe ga (Màu xanh dương bóng bẩy)
    const bodyColor = 0x5b8fc8; 
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        metalness: 0.6,
        roughness: 0.15
    });

    // Sàn để chân bằng phẳng (Võng giữa sườn xe ga) kéo dài ăn khớp sườn sau
    const deckGeom = new THREE.BoxGeometry(1.2, 0.15, 0.65);
    const deck = new THREE.Mesh(deckGeom, bodyMaterial);
    deck.position.set(0.6, 0.75, 0);
    motorcycleGroup.add(deck);

    // Yếm trong bảo vệ chân ôm sát cổ xe
    const legShieldGeom = new THREE.BoxGeometry(0.25, 1.0, 0.65);
    const legShield = new THREE.Mesh(legShieldGeom, bodyMaterial);
    legShield.rotation.z = 0.38;
    legShield.position.set(1.35, 1.35, 0);
    motorcycleGroup.add(legShield);

    // Yếm chắn gió ngoài (Mặt nạ yếm trước to rộng của SH/Vision) bảo vệ cổ xe cực đẹp
    const shieldGeom = new THREE.BoxGeometry(0.18, 1.1, 0.72);
    const shield = new THREE.Mesh(shieldGeom, bodyMaterial);
    shield.rotation.z = 0.38;
    shield.position.set(1.45, 1.45, 0);
    motorcycleGroup.add(shield);

    // Đèn xi-nhan trước LED dọc màu trắng nổi bật hai bên mặt nạ trước
    const indicatorGeom = new THREE.BoxGeometry(0.02, 0.3, 0.08);
    const indicatorMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const leftIndicator = new THREE.Mesh(indicatorGeom, indicatorMat);
    leftIndicator.position.set(1.55, 1.45, 0.22);
    leftIndicator.rotation.z = 0.38;
    const rightIndicator = new THREE.Mesh(indicatorGeom, indicatorMat);
    rightIndicator.position.set(1.55, 1.45, -0.22);
    rightIndicator.rotation.z = 0.38;
    motorcycleGroup.add(leftIndicator, rightIndicator);

    // Chắn bùn trước ôm bánh xe ga
    const mudguardGeom = new THREE.BoxGeometry(0.8, 0.3, 0.5);
    const mudguard = new THREE.Mesh(mudguardGeom, bodyMaterial);
    mudguard.position.set(1.9, 1.15, 0);
    mudguard.rotation.z = 0.38;
    motorcycleGroup.add(mudguard);

    // Kính chắn gió thời trang trên đầu xe gắn khớp nối mặt nạ yếm trước
    const windshieldGeom = new THREE.BoxGeometry(0.04, 0.55, 0.6);
    const windshieldMaterial = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        transparent: true,
        opacity: 0.65,
        roughness: 0.1,
        metalness: 0.9
    });
    const windshield = new THREE.Mesh(windshieldGeom, windshieldMaterial);
    windshield.position.set(1.35, 2.38, 0);
    windshield.rotation.z = 0.38;
    motorcycleGroup.add(windshield);

    // Thùng cốp xe & Vỏ hông thân sau phình tròn đặc trưng của SH ôm gọn bánh sau
    const rearWallMaterial = new THREE.MeshStandardMaterial({
        color: 0x1c1c1e, 
        roughness: 0.5
    });
    
    const trunkBase = new THREE.Group();
    // 1. Phần sườn trước (Cốp sâu dưới yên người lái)
    const sidePanelGeomFront = new THREE.BoxGeometry(1.1, 0.75, 0.05);
    const leftSideFront = new THREE.Mesh(sidePanelGeomFront, bodyMaterial);
    leftSideFront.position.set(-0.55, 0.375, 0.34);
    
    const rightSideFront = new THREE.Mesh(sidePanelGeomFront, bodyMaterial);
    rightSideFront.position.set(-0.55, 0.375, -0.34);
    
    const frontWallGeom = new THREE.BoxGeometry(0.05, 0.75, 0.68);
    const frontWall = new THREE.Mesh(frontWallGeom, rearWallMaterial);
    frontWall.position.set(0, 0.375, 0);
    
    const middleWallGeom = new THREE.BoxGeometry(0.05, 0.75, 0.68);
    const middleWall = new THREE.Mesh(middleWallGeom, rearWallMaterial);
    middleWall.position.set(-1.1, 0.375, 0);
    
    const bottomPlateFrontGeom = new THREE.BoxGeometry(1.1, 0.05, 0.68);
    const bottomPlateFront = new THREE.Mesh(bottomPlateFrontGeom, rearWallMaterial);
    bottomPlateFront.position.set(-0.55, 0.025, 0);
    
    // 2. Phần đuôi sau vuốt cao để chừa bánh sau tự do, chống va chạm
    const sidePanelGeomRear = new THREE.BoxGeometry(1.0, 0.2, 0.05);
    const leftSideRear = new THREE.Mesh(sidePanelGeomRear, bodyMaterial);
    leftSideRear.position.set(-1.6, 0.65, 0.34); // Từ y = 1.2 đến 1.4
    
    const rightSideRear = new THREE.Mesh(sidePanelGeomRear, bodyMaterial);
    rightSideRear.position.set(-1.6, 0.65, -0.34);
    
    const backWallGeom = new THREE.BoxGeometry(0.05, 0.2, 0.68);
    const backWall = new THREE.Mesh(backWallGeom, bodyMaterial);
    backWall.position.set(-2.1, 0.65, 0);
    
    const bottomPlateRearGeom = new THREE.BoxGeometry(1.0, 0.05, 0.68);
    const bottomPlateRear = new THREE.Mesh(bottomPlateRearGeom, rearWallMaterial);
    bottomPlateRear.position.set(-1.6, 0.575, 0); // Đáy chắn bánh sau ở y = 1.225
    
    trunkBase.add(leftSideFront, rightSideFront, frontWall, middleWall, bottomPlateFront,
                  leftSideRear, rightSideRear, backWall, bottomPlateRear);
    trunkBase.position.set(0, 0.65, 0); // Đặt ở gốc sườn xe
    motorcycleGroup.add(trunkBase);

    // 4. Cụm nắp cốp xe & Yên phân tầng cao thấp (Lật mở đồng bộ hướng lên trước)
    // Bản lề (Hinge) đặt ở phía trước khớp nối sàn để chân: x = 0.0, y = 1.4
    trunkLidGroup = new THREE.Group();
    trunkLidGroup.position.set(0.0, 1.4, 0); 

    // Tấm lót đáy yên phủ trọn chiều dài 2.1
    const lidGeom = new THREE.BoxGeometry(2.1, 0.06, 0.68);
    const lidMesh = new THREE.Mesh(lidGeom, bodyMaterial);
    lidMesh.position.set(-1.05, 0.03, 0); 
    trunkLidGroup.add(lidMesh);

    // Yên xe bọc da đen contoured phân tầng (Thấp trước, cao sau giống SH/Vision)
    const seatMaterial = new THREE.MeshStandardMaterial({
        color: 0x2c2c2e, 
        roughness: 0.85
    });
    // Yên trước (Rider) - Thấp hơn một chút kéo dài
    const frontSeatGeom = new THREE.BoxGeometry(1.0, 0.18, 0.62);
    const frontSeat = new THREE.Mesh(frontSeatGeom, seatMaterial);
    frontSeat.position.set(-0.5, 0.15, 0); 
    trunkLidGroup.add(frontSeat);

    // Yên sau (Passenger) - Cao hơn và bo rộng che kín bánh sau
    const rearSeatGeom = new THREE.BoxGeometry(0.9, 0.25, 0.56);
    const rearSeat = new THREE.Mesh(rearSeatGeom, seatMaterial);
    rearSeat.position.set(-1.45, 0.2, 0); 
    trunkLidGroup.add(rearSeat);

    // Tay dắt đuôi xe (Grab Rail) ôm trọn đuôi
    const grabRailGeom = new THREE.BoxGeometry(0.3, 0.04, 0.5);
    const grabRailMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, metalness: 0.2, roughness: 0.6 });
    const grabRail = new THREE.Mesh(grabRailGeom, grabRailMat);
    grabRail.position.set(-1.95, 0.22, 0);
    trunkLidGroup.add(grabRail);
    
    motorcycleGroup.add(trunkLidGroup);

    // 5. Thiết bị IoT nằm trong cốp
    const iotDeviceGroup = new THREE.Group();
    const deviceMaterial = new THREE.MeshStandardMaterial({
        color: 0x007aff, 
        metalness: 0.2,
        roughness: 0.3
    });
    const iotBoxGeom = new THREE.BoxGeometry(0.4, 0.2, 0.45);
    iotDeviceMesh = new THREE.Mesh(iotBoxGeom, deviceMaterial);
    iotDeviceMesh.position.set(0, 0.1, 0);
    iotDeviceGroup.add(iotDeviceMesh);

    // Đèn LED nhấp nháy trên IoT Box
    const ledGeom = new THREE.SphereGeometry(0.03, 8, 8);
    const ledMaterial = new THREE.MeshBasicMaterial({ color: 0x32d74b }); 
    const ledMesh = new THREE.Mesh(ledGeom, ledMaterial);
    ledMesh.position.set(0.12, 0.21, 0.12);
    iotDeviceGroup.add(ledMesh);

    iotDeviceGroup.position.set(-0.8, 0.7, 0); // Đặt gọn dưới lòng cốp hạ thấp
    motorcycleGroup.add(iotDeviceGroup);

    // 6. Cụm ghi đông & Đầu xe ga & Đèn pha chính
    const handlebarGroup = new THREE.Group();
    handlebarGroup.position.set(1.3, 2.1, 0);
    
    // Thanh ghi đông chính
    const barGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8);
    const barMesh = new THREE.Mesh(barGeom, frameMaterial);
    barMesh.rotation.x = Math.PI / 2;
    handlebarGroup.add(barMesh);

    // Bao tay lái màu đen
    const gripGeom = new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8);
    const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const leftGrip = new THREE.Mesh(gripGeom, gripMaterial);
    leftGrip.position.set(0, 0, 0.38);
    leftGrip.rotation.x = Math.PI / 2;
    const rightGrip = new THREE.Mesh(gripGeom, gripMaterial);
    rightGrip.position.set(0, 0, -0.38);
    rightGrip.rotation.x = Math.PI / 2;
    handlebarGroup.add(leftGrip, rightGrip);

    // Mặt nạ đầu xe (Handlebar Cowl) góc cạnh thể thao ôm ghi đông
    const cowlGeom = new THREE.BoxGeometry(0.25, 0.22, 0.65);
    const cowl = new THREE.Mesh(cowlGeom, bodyMaterial);
    cowl.position.set(0.05, 0, 0);
    handlebarGroup.add(cowl);

    // Cụm đèn pha tích hợp trên đầu xe ga (Mặt xiên vát góc xi-nhan)
    const lightGeom = new THREE.BoxGeometry(0.08, 0.12, 0.28);
    const lightHousing = new THREE.Mesh(lightGeom, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    lightHousing.position.set(0.18, 0, 0);
    handlebarGroup.add(lightHousing);

    // Gương chiếu hậu gắn trực tiếp làm con của chân gương để chống trôi khi xoay
    const mirrorStemGeom = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8);
    const mirrorBodyGeom = new THREE.BoxGeometry(0.06, 0.12, 0.2);
    const mirrorGlassGeom = new THREE.PlaneGeometry(0.11, 0.19);
    const mirrorGlassMat = new THREE.MeshStandardMaterial({ color: 0xe1ecf7, metalness: 1.0, roughness: 0.05 });

    // Gương trái
    const leftStem = new THREE.Mesh(mirrorStemGeom, chromeMat);
    leftStem.position.set(0, 0.15, 0.35);
    leftStem.rotation.z = -Math.PI / 6;
    leftStem.rotation.x = Math.PI / 6;

    const mirrorBodyL = new THREE.Mesh(mirrorBodyGeom, bodyMaterial);
    mirrorBodyL.position.set(0, 0.15, 0); 
    const mirrorGlassL = new THREE.Mesh(mirrorGlassGeom, mirrorGlassMat);
    mirrorGlassL.position.set(-0.031, 0, 0);
    mirrorGlassL.rotation.y = -Math.PI / 2;
    mirrorBodyL.add(mirrorGlassL);
    leftStem.add(mirrorBodyL);
    handlebarGroup.add(leftStem);

    // Gương phải
    const rightStem = new THREE.Mesh(mirrorStemGeom, chromeMat);
    rightStem.position.set(0, 0.15, -0.35);
    rightStem.rotation.z = -Math.PI / 6;
    rightStem.rotation.x = -Math.PI / 6;

    const mirrorBodyR = new THREE.Mesh(mirrorBodyGeom, bodyMaterial);
    mirrorBodyR.position.set(0, 0.15, 0); 
    const mirrorGlassR = new THREE.Mesh(mirrorGlassGeom, mirrorGlassMat);
    mirrorGlassR.position.set(-0.031, 0, 0);
    mirrorGlassR.rotation.y = -Math.PI / 2;
    mirrorBodyR.add(mirrorGlassR);
    rightStem.add(mirrorBodyR);
    handlebarGroup.add(rightStem);

    motorcycleGroup.add(handlebarGroup);

    // 7. Chân chống nghiêng thanh lịch (Nghiêng ra ngoài đỡ xe)
    const standGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8);
    standGeom.translate(0, -0.4, 0);
    const standMesh = new THREE.Mesh(standGeom, frameMaterial);
    const standGroup = new THREE.Group();
    standGroup.position.set(-0.1, 0.65, 0.25);
    standGroup.rotation.x = -Math.PI / 5;  // Nghiêng ra ngoài 36 độ (+Z)
    standGroup.rotation.z = -Math.PI / 10; // Nghiêng về sau 18 độ (-X)
    standGroup.add(standMesh);
    motorcycleGroup.add(standGroup);

    // 8. Đèn hậu LED gắn sát đuôi cốp xe
    const tailLightGeom = new THREE.BoxGeometry(0.05, 0.1, 0.35);
    const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    const tailLight = new THREE.Mesh(tailLightGeom, tailLightMat);
    tailLight.position.set(-2.12, 1.3, 0);
    motorcycleGroup.add(tailLight);

    // Chắn bùn sau vuốt nhọn chéo xuôi xuống sau bánh xe
    const fenderGeom = new THREE.BoxGeometry(0.04, 0.6, 0.35);
    const fenderMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.8 });
    const fender = new THREE.Mesh(fenderGeom, fenderMat);
    fender.position.set(-2.25, 1.15, 0);
    fender.rotation.z = -Math.PI / 4; // Xiên xuôi 45 độ về phía sau
    motorcycleGroup.add(fender);

    // Pát gắn biển số sau gắn trực tiếp lên chắn bùn sau
    const plateHolderGeom = new THREE.BoxGeometry(0.02, 0.22, 0.28);
    const plateHolderMat = new THREE.MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.8 });
    const plateHolder = new THREE.Mesh(plateHolderGeom, plateHolderMat);
    plateHolder.position.set(-0.03, -0.1, 0); // Đặt ở mặt lưng chắn bùn
    fender.add(plateHolder);
    
    const plateGeom = new THREE.BoxGeometry(0.01, 0.20, 0.26);
    const plateMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const plate = new THREE.Mesh(plateGeom, plateMat);
    plate.position.set(-0.01, 0, 0);
    plateHolder.add(plate);

    // 9. Giảm xóc sau màu đỏ (Dual Spring Shock Absorbers) ôm bánh sau khớp nối hoàn hảo
    const shockLeft = new THREE.Group();
    shockLeft.position.set(-1.5, 1.25, 0.28);
    shockLeft.rotation.z = -0.65;
    
    // Ty giảm xóc mạ chrome
    const pistonGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.82, 8);
    pistonGeom.translate(0, -0.41, 0);
    const piston = new THREE.Mesh(pistonGeom, chromeMat);
    shockLeft.add(piston);
    
    // Lò xo giảm xóc nửa trên màu đỏ nổi bật
    const springGeom = new THREE.CylinderGeometry(0.038, 0.038, 0.41, 8);
    springGeom.translate(0, -0.205, 0);
    const springMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, metalness: 0.3, roughness: 0.3 });
    const spring = new THREE.Mesh(springGeom, springMat);
    shockLeft.add(spring);
    
    // Vỏ bọc xi-lanh dầu nửa dưới màu đỏ
    const sleeveGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.41, 8);
    sleeveGeom.translate(0, -0.615, 0);
    const sleeve = new THREE.Mesh(sleeveGeom, springMat);
    shockLeft.add(sleeve);
    
    motorcycleGroup.add(shockLeft);
    
    // Giảm xóc bên phải đối xứng qua trục
    const shockRight = shockLeft.clone();
    shockRight.position.z = -0.28;
    motorcycleGroup.add(shockRight);

    // 10. Ống xả vát góc kiểu xe ga SH (Pentagonal Muffler) nằm ngang chếch nhẹ đuôi lên
    const exhaustGroup = new THREE.Group();
    exhaustGroup.position.set(-1.3, 0.62, -0.42);
    
    // Thân pô vát góc dài
    const mufflerGeom = new THREE.BoxGeometry(0.75, 0.16, 0.12);
    const mufflerMat = new THREE.MeshStandardMaterial({ color: 0x2c2c2e, metalness: 0.5, roughness: 0.4 });
    const muffler = new THREE.Mesh(mufflerGeom, mufflerMat);
    muffler.rotation.z = -0.18; // Xiên chếch đuôi nhẹ lên trên khoảng 10 độ
    exhaustGroup.add(muffler);

    // Tấm ốp pô bạc bảo vệ chống bỏng (Heat Shield)
    const shieldCoverGeom = new THREE.BoxGeometry(0.68, 0.12, 0.03);
    const shieldCoverMat = new THREE.MeshStandardMaterial({ color: 0xe8ecf1, metalness: 0.7, roughness: 0.2 });
    const shieldCover = new THREE.Mesh(shieldCoverGeom, shieldCoverMat);
    shieldCover.position.set(0, 0, -0.07); // Ốp phía bên ngoài pô
    muffler.add(shieldCover);
    
    // Đầu chụp ống xả chrome
    const tipGeom = new THREE.CylinderGeometry(0.04, 0.05, 0.08, 12);
    const tip = new THREE.Mesh(tipGeom, chromeMat);
    tip.rotation.z = Math.PI / 2; // Nằm dọc theo chiều ngang của thân pô
    tip.position.set(-0.38, 0, 0); // Đặt ở chóp đuôi pô
    muffler.add(tip);
    
    // Cổ pô uốn gọn luồn dưới gầm nối sườn xe ga
    const headerGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8);
    const header = new THREE.Mesh(headerGeom, chromeMat);
    header.rotation.z = -Math.PI / 3;
    header.position.set(0.4, 0.0, 0.05);
    exhaustGroup.add(header);

    motorcycleGroup.add(exhaustGroup);

    scene.add(motorcycleGroup);
}

// Khởi tạo sự kiện chuyển đổi Tab
function setupTabSwitching() {
    const tabMapBtn = document.getElementById('tab-map-btn');
    const tab3dBtn = document.getElementById('tab-3d-btn');
    const mapDiv = document.getElementById('map');
    const d3dDiv = document.getElementById('dashboard-3d');

    if (!tabMapBtn || !tab3dBtn || !mapDiv || !d3dDiv) return;

    tabMapBtn.addEventListener('click', () => {
        tabMapBtn.classList.add('active');
        tab3dBtn.classList.remove('active');
        mapDiv.classList.remove('hidden');
        d3dDiv.classList.add('hidden');
        
        // Dừng vòng lặp vẽ 3D để tối ưu hiệu năng
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        // Cập nhật lại Leaflet Map
        setTimeout(() => {
            if (map) map.invalidateSize();
        }, 100);
    });

    tab3dBtn.addEventListener('click', () => {
        tab3dBtn.classList.add('active');
        tabMapBtn.classList.remove('active');
        mapDiv.classList.add('hidden');
        d3dDiv.classList.remove('hidden');

        // Khởi tạo 3D và chạy vòng lặp
        if (!is3DInitialized) {
            init3D();
        }
        resize3D();
        if (!animationFrameId) {
            animate();
        }
    });
}

// Cấu hình tương tác nhấp chọn (click) trên Sơ đồ mạch SVG
function setupCircuitSchematicInteractions() {
    const components = {
        'comp-esp32': {
            nameVi: "VI ĐIỀU KHIỂN ESP32",
            nameEn: "ESP32 MICROCONTROLLER",
            descVi: i18n.vi.circuit_desc_esp32,
            descEn: i18n.en.circuit_desc_esp32,
            traces: ['trace-vcc', 'trace-gnd', 'trace-mpu-sda', 'trace-mpu-scl', 'trace-buzzer']
        },
        'comp-mpu': {
            nameVi: "CẢM BIẾN TỌA ĐỘ MPU6050",
            nameEn: "MPU6050 IMU ACCEL/GYRO",
            descVi: i18n.vi.circuit_desc_mpu,
            descEn: i18n.en.circuit_desc_mpu,
            traces: ['trace-vcc', 'trace-gnd', 'trace-mpu-sda', 'trace-mpu-scl']
        },
        'comp-buzzer': {
            nameVi: "CÒI BÁO ĐỘNG BUZZER",
            nameEn: "ACTIVE BUZZER ALARM",
            descVi: i18n.vi.circuit_desc_buzzer,
            descEn: i18n.en.circuit_desc_buzzer,
            traces: ['trace-vcc', 'trace-gnd', 'trace-buzzer']
        }
    };

    const compName = document.getElementById('circuit-comp-name');
    const compDesc = document.getElementById('circuit-comp-desc');
    const closeBtn = document.getElementById('close-circuit');
    const circuitModal = document.getElementById('circuit-modal');

    let selectedComponentId = null;

    // Reset giao diện và bỏ chọn
    function resetSelection() {
        if (selectedComponentId && components[selectedComponentId]) {
            components[selectedComponentId].traces.forEach(traceClass => {
                const traces = document.querySelectorAll('.' + traceClass);
                traces.forEach(t => {
                    t.classList.remove('highlight');
                    const highlightClass = 'highlight-' + traceClass.replace('trace-', '');
                    t.classList.remove(highlightClass);
                });
            });
            const prevEl = document.getElementById(selectedComponentId);
            if (prevEl) prevEl.classList.remove('selected');
        }
        selectedComponentId = null;
        compName.innerText = currentLang === 'vi' ? "Chọn linh kiện" : "Select Component";
        compDesc.innerText = currentLang === 'vi' ? "Nhấp chọn linh kiện trên sơ đồ để xem vai trò và thông tin kết nối chi tiết." : "Click on a component in the schematic to view its role and detailed connection pinouts.";
    }

    if (closeBtn && circuitModal) {
        closeBtn.onclick = () => {
            circuitModal.style.display = 'none';
            resetSelection();
        };
    }

    // Đóng và reset khi click ra ngoài vùng modal
    window.addEventListener('click', (e) => {
        if (circuitModal && e.target == circuitModal) {
            circuitModal.style.display = 'none';
            resetSelection();
        }
    });

    // Gắn sự kiện click (chọn) cho các linh kiện
    Object.keys(components).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        const data = components[id];

        el.addEventListener('click', () => {
            // Nếu click lại chính linh kiện đang chọn -> Bỏ chọn (toggle)
            if (selectedComponentId === id) {
                resetSelection();
                return;
            }

            // Reset linh kiện cũ trước đó
            if (selectedComponentId && components[selectedComponentId]) {
                components[selectedComponentId].traces.forEach(traceClass => {
                    const traces = document.querySelectorAll('.' + traceClass);
                    traces.forEach(t => {
                        t.classList.remove('highlight');
                        const highlightClass = 'highlight-' + traceClass.replace('trace-', '');
                        t.classList.remove(highlightClass);
                    });
                });
                const prevEl = document.getElementById(selectedComponentId);
                if (prevEl) prevEl.classList.remove('selected');
            }

            // Gán linh kiện được chọn mới
            selectedComponentId = id;
            el.classList.add('selected');

            // Cập nhật thông tin chi tiết
            compName.innerText = currentLang === 'vi' ? data.nameVi : data.nameEn;
            compDesc.innerText = currentLang === 'vi' ? data.descVi : data.descEn;

            // Làm nổi bật đường dây (highlight traces)
            data.traces.forEach(traceClass => {
                const traces = document.querySelectorAll('.' + traceClass);
                traces.forEach(t => {
                    t.classList.add('highlight');
                    const highlightClass = 'highlight-' + traceClass.replace('trace-', '');
                    t.classList.add(highlightClass);
                });
            });
        });
    });

    // Kích hoạt nhấp nháy LED trên PCB ảo
    const mpuLed = document.getElementById('mpu-led');
    if (mpuLed) mpuLed.classList.add('active');

    // Lắng nghe còi báo từ Firebase để hiển thị sóng âm
    onValue(ref(db, 'tracker/action/ring'), (snapshot) => {
        const ring = snapshot.val();
        const wave1 = document.getElementById('buzzer-wave-1');
        const wave2 = document.getElementById('buzzer-wave-2');
        
        if (wave1 && wave2) {
            if (ring) {
                wave1.classList.add('active');
                wave2.classList.add('active');
                
                // Tự động tắt còi sau 5 giây để mô phỏng bíp bíp
                setTimeout(() => {
                    set(ref(db, 'tracker/action/ring'), false);
                }, 5000);
            } else {
                wave1.classList.remove('active');
                wave2.classList.remove('active');
            }
        }
    });
}
