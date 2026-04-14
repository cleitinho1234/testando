let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let listaOnlineGlobal = [];
let statusInterval; 
let typingTimeout;
let receiveTypingTimeout;

// Variáveis para Ligação
let localStream;
let peerConnection;
let isVivaVoz = false;
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// --- LÓGICA DE TEMA (ESCURO/CLARO) ---
function inicializarTema() {
    const themeToggle = document.getElementById("themeToggle");
    const body = document.body;
    if (localStorage.getItem("theme") === "dark") {
        body.classList.add("dark-theme");
        if (themeToggle) themeToggle.textContent = "☀️";
    }
    if (themeToggle) {
        themeToggle.onclick = () => {
            body.classList.toggle("dark-theme");
            const isDark = body.classList.contains("dark-theme");
            themeToggle.textContent = isDark ? "☀️" : "🌙";
            localStorage.setItem("theme", isDark ? "dark" : "light");
        };
    }
}

// --- FUNÇÃO DE PERSISTÊNCIA (DEVICE ID) ---
function gerarDeviceID() {
    const info = [navigator.userAgent, navigator.language, screen.colorDepth, screen.width + 'x' + screen.height, navigator.hardwareConcurrency].join('###');
    let hash = 0;
    for (let i = 0; i < info.length; i++) {
        let char = info.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return "DEV-" + Math.abs(hash);
}

// --- INICIALIZAÇÃO ---
window.addEventListener("load", async () => {
    inicializarTema(); 
    const deviceID = gerarDeviceID();
    
    if (localStorage.getItem("userId") === "undefined" || localStorage.getItem("userId") === "null") {
        localStorage.clear();
    }

    let localUser = localStorage.getItem("myUserObject");
    let savedId = localStorage.getItem("userId");

    if (localUser) {
        currentUser = JSON.parse(localUser);
    } else if (savedId) {
        const res = await fetch(`/api/user/${savedId}`);
        const user = await res.json();
        if (!user.error) currentUser = user;
    }

    if (!currentUser) {
        try {
            const resRecover = await fetch(`/api/recover-by-device/${deviceID}`);
