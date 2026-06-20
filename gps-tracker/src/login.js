// File: login.js — Login page authentication handler

import { firebaseConfig } from './config.js';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import './style.css';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', () => {
  // --- Auth guard: redirect if already logged in ---
  onAuthStateChanged(auth, (user) => {
    if (user) {
      window.location.href = '/dashboard.html';
    }
  });

  // --- Login button ---
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      let email = (document.getElementById('username')?.value.trim()) || '';
      const pass = (document.getElementById('password')?.value.trim()) || '';
      const errorEl = document.getElementById('login-error');

      if (email && !email.includes('@')) {
        email += '@gps.com';
      }

      try {
        await signInWithEmailAndPassword(auth, email, pass);
        window.location.href = '/dashboard.html';
      } catch (error) {
        console.error('Login error:', error.code, error.message);
        if (errorEl) {
          errorEl.innerText = `Đăng nhập với email "${email}" không thành công. Vui lòng kiểm tra lại.`;
          errorEl.style.display = 'block';
          // Trigger shake animation
          errorEl.style.animation = 'none';
          setTimeout(() => {
            errorEl.style.animation = 'shake 0.4s';
          }, 10);
        }
      }
    });
  }

  // --- Enter key on password field → trigger login ---
  const passwordInput = document.getElementById('password');
  if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) loginBtn.click();
      }
    });
  }

  // --- Google sign-in buttons (placeholder) ---
  const googleStudentBtn = document.getElementById('google-student-btn');
  if (googleStudentBtn) {
    googleStudentBtn.addEventListener('click', () => {
      alert('Tính năng đang phát triển');
    });
  }

  const googleTeacherBtn = document.getElementById('google-teacher-btn');
  if (googleTeacherBtn) {
    googleTeacherBtn.addEventListener('click', () => {
      alert('Tính năng đang phát triển');
    });
  }
});
