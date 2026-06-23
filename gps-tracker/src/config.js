// File: config.js

export const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const appVersion = "2.4.0"; 

export const i18n = {
    vi: { 
        lbl_dwell: "Đang ở đây", st_ok: "Cân bằng", 
        st_fall: "ĐỔ NGÃ!", st_label: "Trạng thái", btn_find: "TÌM ĐƯỜNG", 
        mode_bike: "🏍️ Xe máy", mode_car: "🚗 Xe hơi", mode_foot: "🚶 Đi bộ", 
        about_title: "Thông tin dự án", about_subject: "Môn học:", 
        val_subject: "Cơ sở và ứng dụng IoTs", about_by: "Thiết kế bởi:", 
        val_group: "Nhóm 7 tại HCM-UTE", btn_close: "Đóng", 
        val_quote: '"Chia sẻ là cách tốt nhất để học tập"', btn_buzzer: "🔊 Tìm xe", 
        btn_history: "📜 Lịch sử", btn_fall: "🔔 Té ngã", history_title: "Lịch sử di chuyển", 
        fall_title: "Lịch sử sự cố", btn_export: "Tải file Excel", 
        th_time: "Thời gian", th_lat: "Vĩ độ (Lat)", th_lng: "Kinh độ (Lng)", btn_logout: "Thoát",
        tab_map: "🗺️ Bản đồ", tab_3d: "🏍️ Mô hình 3D",
        panel_3d_title: "HỆ THỐNG GIÁM SÁT 3D",
        panel_3d_speed: "Vận tốc xe", panel_3d_angle: "Góc nghiêng",
        panel_3d_trunk: "Trạng thái cốp", panel_3d_trunk_open: "Mở", panel_3d_trunk_close: "Đóng",
        panel_3d_instruction: "Hướng dẫn tương tác",
        panel_3d_instr_1: "👉 Nhấp chuột trái & kéo để xoay xe",
        panel_3d_instr_2: "👉 Nhấp chuột phải & kéo để dịch chuyển",
        panel_3d_instr_3: "👉 Cuộn chuột để phóng to / thu nhỏ",
        panel_3d_instr_4: "👉 Nhấp vào Cốp Xe để MỞ/ĐÓNG cốp",
        panel_3d_instr_5: "👉 Nhấp vào hộp thiết bị IoT màu xanh trong cốp để xem Sơ đồ mạch",
        circuit_title: "SƠ ĐỒ NGUYÊN LÝ MẠCH GPS TRACKER ESP32",
        circuit_desc_esp32: "Vi điều khiển ESP32: Nhận dữ liệu từ GPS và MPU6050, xử lý rồi truyền thời gian thực lên Firebase Database qua Wi-Fi.",
        circuit_desc_gps: "Module GPS NEO-6M: Kết nối vệ tinh để thu thập kinh độ, vĩ độ, thời gian và vận tốc di chuyển của xe.",
        circuit_desc_mpu: "Cảm biến MPU6050: Đo gia tốc và tốc độ góc để giám sát trạng thái cân bằng, phát hiện té ngã.",
        circuit_desc_buzzer: "Còi báo Active Buzzer: Phát âm thanh cảnh báo tại chỗ khi có sự cố té ngã hoặc khi nhận tín hiệu Tìm xe."
    },
    en: { 
        lbl_dwell: "Dwell Time", st_ok: "Balanced", 
        st_fall: "FALLEN!", st_label: "Status", btn_find: "DIRECTIONS", 
        mode_bike: "🏍️ Motorcycle", mode_car: "🚗 Car", mode_foot: "🚶 Walking", 
        about_title: "Project Information", about_subject: "Subject:", 
        val_subject: "Fundamentals & Applications of IoTs", about_by: "Designed by:", 
        val_group: "Group 7 at HCM-UTE", btn_close: "Close", 
        val_quote: '"Sharing is the best way of learning"', btn_buzzer: "🔊 Find Vehicle", 
        btn_history: "📜 History", btn_fall: "🔔 Falls", history_title: "Travel History", 
        fall_title: "Fall Detection History", btn_export: "Download Excel", 
        th_time: "Time", th_lat: "Latitude", th_lng: "Longitude", btn_logout: "Logout",
        tab_map: "🗺️ Map", tab_3d: "🏍️ 3D Model",
        panel_3d_title: "3D DIGITAL TWIN SYSTEM",
        panel_3d_speed: "Vehicle Speed", panel_3d_angle: "Tilt Angle",
        panel_3d_trunk: "Trunk Status", panel_3d_trunk_open: "Open", panel_3d_trunk_close: "Closed",
        panel_3d_instruction: "Interaction Guide",
        panel_3d_instr_1: "👉 Left-click & drag to rotate vehicle",
        panel_3d_instr_2: "👉 Right-click & drag to pan camera",
        panel_3d_instr_3: "👉 Scroll wheel to zoom in / out",
        panel_3d_instr_4: "👉 Click on the Trunk to OPEN/CLOSE it",
        panel_3d_instr_5: "👉 Click on the blue IoT device box inside to see Circuit Schematic",
        circuit_title: "ESP32 GPS TRACKER SCHEMATIC DIAGRAM",
        circuit_desc_esp32: "ESP32 MCU: Reads data from GPS & MPU6050, processes it and streams to Firebase Realtime Database in real time via Wi-Fi.",
        circuit_desc_gps: "NEO-6M GPS Module: Connects to satellites to acquire coordinates, altitude, UTC time, and vehicle speed.",
        circuit_desc_mpu: "MPU6050 Sensor: Measures acceleration and angular velocity to track vehicle tilt status and detect accidents.",
        circuit_desc_buzzer: "Active Buzzer: Produces alert sound locally during fall events or when triggered remotely to locate the vehicle."
    }
};