/* --- VARIÁVEIS GLOBAIS --- */
let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let listaOnlineGlobal = [];
let receiveTypingTimeout;

// Variáveis para Ligação (WebRTC)
let localStream;
let peerConnection;
let isVivaVoz = false;
let callType = 'audio'; // 'audio' ou 'video'
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// --- LÓGICA DE TEMA ---
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

// --- DEVICE ID PARA PERSISTÊNCIA ---
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

// --- INICIALIZAÇÃO DO APP ---
window.addEventListener("load", async () => {
    inicializarTema(); 
    const deviceID = gerarDeviceID();
    
    // Recuperação de conta ou criação de nova
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
            const recovered = await resRecover.json();
            if (recovered && !recovered.error) {
                currentUser = recovered;
                localStorage.setItem("userId", currentUser.id);
                localStorage.setItem("myUserObject", JSON.stringify(currentUser));
            }
        } catch (e) { console.log("Nenhuma conta para recuperar."); }
    }

    if (!currentUser) {
        const res = await fetch("/api/user", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ username: "Novo Usuário", photo: "", deviceId: deviceID })
        });
        currentUser = await res.json();
        localStorage.setItem("userId", currentUser.id);
        localStorage.setItem("myUserObject", JSON.stringify(currentUser));
    }

    socket.emit("register", currentUser.id);
    document.getElementById("username").value = currentUser.username || "";
    document.getElementById("userIdDisplay").textContent = currentUser.id;
    
    if(currentUser.photo) {
        document.getElementById("profilePreview").src = currentUser.photo;
    }

    renderContacts();
    setInterval(loadMessages, 2000);
});

// --- LÓGICA DE CHAMADA (WEBRTC) ---

async function iniciarChamada(tipo) {
    if (!currentChat) return;
    callType = tipo; // 'audio' ou 'video'
    contatoSelecionadoId = currentChat.id;
    
    mostrarTelaChamada(currentChat.username, currentChat.photo, tipo === 'video' ? "Iniciando vídeo..." : "Chamando...");

    try {
        const constraints = { audio: true, video: tipo === 'video' };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Se for vídeo, mostra o localVideo
        if (tipo === 'video') {
            document.getElementById("localVideo").srcObject = localStream;
            document.getElementById("callPhoto").style.display = "none";
        }

        peerConnection = new RTCPeerConnection(rtcConfig);
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("iceCandidate", { toId: contatoSelecionadoId, candidate: event.candidate });
            }
        };

        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = (event) => {
            const remoteVid = document.getElementById("remoteVideo");
            remoteVid.srcObject = event.streams[0];
            document.getElementById("callStatusText").textContent = "Em linha";
            if (tipo === 'video') document.getElementById("callPhoto").style.display = "none";
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit("callUser", {
            toId: contatoSelecionadoId,
            fromName: currentUser.username,
            fromPhoto: currentUser.photo,
            fromId: currentUser.id,
            signal: offer,
            type: tipo
        });

    } catch (err) {
        alert("Erro: Permissão de câmera/microfone negada.");
        desligarChamada();
    }
}

socket.on("incomingCall", (data) => {
    contatoSelecionadoId = data.fromId; 
    callType = data.type || 'audio';
    mostrarTelaChamada(data.fromName, data.fromPhoto, callType === 'video' ? "Chamada de vídeo..." : "Recebendo ligação...");
    document.getElementById("btnAtender").style.display = "block";
    window.incomingSignal = data.signal;
});

async function atenderChamada() {
    document.getElementById("btnAtender").style.display = "none";
    document.getElementById("callStatusText").textContent = "Conectando...";
    try {
        const constraints = { audio: true, video: callType === 'video' };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (callType === 'video') {
            document.getElementById("localVideo").srcObject = localStream;
            document.getElementById("callPhoto").style.display = "none";
        }

        peerConnection = new RTCPeerConnection(rtcConfig);
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("iceCandidate", { toId: contatoSelecionadoId, candidate: event.candidate });
            }
        };

        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = (event) => {
            const remoteVid = document.getElementById("remoteVideo");
            remoteVid.srcObject = event.streams[0];
            document.getElementById("callStatusText").textContent = "Em linha";
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(window.incomingSignal));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit("acceptCall", { toId: contatoSelecionadoId, signal: answer });
    } catch (err) {
        desligarChamada();
    }
}

socket.on("callAccepted", async (data) => {
    if (data.signal && peerConnection) {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
            document.getElementById("callStatusText").textContent = "Em linha";
        } catch (e) { console.error("Erro ao finalizar conexão:", e); }
    }
});

function mostrarTelaChamada(nome, foto, status) {
    document.getElementById("callScreen").style.display = "flex";
    document.getElementById("callName").textContent = nome;
    document.getElementById("callPhoto").src = foto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById("callPhoto").style.display = "block";
    document.getElementById("callStatusText").textContent = status;
}

function desligarChamada() {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (peerConnection) peerConnection.close();
    
    const idDestino = contatoSelecionadoId || (currentChat ? currentChat.id : null);
    if (idDestino) socket.emit("endCall", { toId: idDestino });
    
    document.getElementById("callScreen").style.display = "none";
    document.getElementById("localVideo").srcObject = null;
    document.getElementById("remoteVideo").srcObject = null;
    
    contatoSelecionadoId = null;
    peerConnection = null;
    localStream = null;
}

socket.on("callEnded", () => {
    desligarChamada();
});

function toggleCamera() {
    if (localStream && callType === 'video') {
        const videoTrack = localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        alert(videoTrack.enabled ? "Câmera Ativada" : "Câmera Desativada");
    }
}

function toggleVivaVoz() {
    const remoteVid = document.getElementById("remoteVideo");
    isVivaVoz = !isVivaVoz;
    remoteVid.volume = isVivaVoz ? 1.0 : 0.5;
    document.getElementById("btnVivaVoz").textContent = isVivaVoz ? "VIVA-VOZ: ON" : "VIVA-VOZ: OFF";
    document.getElementById("btnVivaVoz").style.background = isVivaVoz ? "#25D366" : "rgba(255,255,255,0.2)";
}

socket.on("iceCandidate", async (data) => {
    try {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (e) { console.error("Erro ICE:", e); }
});

// --- RESTANTE DAS FUNÇÕES (MSGS, STATUS, PERFIL) ---

socket.on("updateStatus", (listaOnline) => {
    listaOnlineGlobal = listaOnline;
    renderContacts(); 
    if (currentChat) atualizarStatusChatInterno(currentChat.id);
});

socket.on("userTyping", (data) => {
    if (currentChat && currentChat.id === data.fromId) {
        const statusElement = document.getElementById("chatStatus");
        if (statusElement) {
            statusElement.textContent = "Digitando...";
            statusElement.style.color = "#25D366";
            clearTimeout(receiveTypingTimeout);
            receiveTypingTimeout = setTimeout(() => {
                atualizarStatusChatInterno(data.fromId);
            }, 2000);
        }
    }
});

function atualizarStatusChatInterno(id) {
    const statusElement = document.getElementById("chatStatus");
    if (statusElement) {
        const isOnline = listaOnlineGlobal.includes(id);
        statusElement.textContent = isOnline ? "Online" : "Offline";
        statusElement.style.color = isOnline ? "#25D366" : "gray";
    }
}

const messageInput = document.getElementById("messageText");
if (messageInput) {
    messageInput.oninput = () => {
        if (!currentChat || !currentUser) return;
        socket.emit("typing", { fromId: currentUser.id, toId: currentChat.id });
    };
}

function renderContacts() {
    const div = document.getElementById("contacts");
    if(!div) return;
    div.innerHTML = "";
    contacts.forEach(user => {
        const count = unreadCounts[user.id] || 0;
        const isOnline = listaOnlineGlobal.includes(user.id);
        const contactEl = document.createElement("div");
        contactEl.className = `contact ${currentChat && currentChat.id === user.id ? 'selected' : ''}`;
        contactEl.innerHTML = `
            <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="contact-img">
            <div style="flex:1;">
                <div style="font-weight:bold;">${user.username}</div>
                <div style="font-size:11px; color:${isOnline ? '#25D366' : 'gray'}">${isOnline ? '● Online' : '● Offline'}</div>
            </div>
            ${count > 0 ? `<span class="badge">${count}</span>` : ""}
        `;
        contactEl.onclick = () => abrirChat(user);
        div.appendChild(contactEl);
    });
}

function abrirChat(user) {
    currentChat = user;
    unreadCounts[user.id] = 0;
    localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
    document.getElementById("home").style.display = "none";
    document.getElementById("chatScreen").style.display = "flex";
    document.getElementById("chatName").textContent = user.username;
    document.getElementById("chatAvatar").src = user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    atualizarStatusChatInterno(user.id);
    socket.emit("readMessages", { fromId: user.id, toId: currentUser.id });
    loadMessages();
    renderContacts();
}

async function loadMessages() {
    if(!currentUser || !currentChat) return;
    try {
        const res = await fetch(`/api/messages/${currentUser.id}/${currentChat.id}`);
        const msgs = await res.json();
        const container = document.getElementById("messages");
        container.innerHTML = "";
        let ultimaData = null;

        msgs.forEach(m => {
            const dataMsg = new Date(m.timestamp || Date.now());
            const dataFormatada = dataMsg.toLocaleDateString();
            if (dataFormatada !== ultimaData) {
                const divData = document.createElement("div");
                divData.className = "date-separator";
                divData.innerHTML = `<span>${dataFormatada}</span>`;
                container.appendChild(divData);
                ultimaData = dataFormatada;
            }
            const hora = dataMsg.getHours().toString().padStart(2, '0') + ":" + dataMsg.getMinutes().toString().padStart(2, '0');
            const div = document.createElement("div");
            div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
            const check = m.visualizada ? '<span style="color: #34B7F1;">✔✔</span>' : '<span style="color: gray;">✔</span>';
            div.innerHTML = `<div class="bubble">${m.text}<div class="message-info">${hora} ${m.fromId == currentUser.id ? check : ""}</div></div>`;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    } catch (e) { console.error("Erro ao carregar msgs", e); }
}

document.getElementById("sendMessageBtn").onclick = async () => {
    const input = document.getElementById("messageText");
    const text = input.value.trim();
    if(!text || !currentChat) return;
    input.value = ""; 
    await fetch("/api/messages", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ fromId: currentUser.id, toId: currentChat.id, text })
    });
    loadMessages();
};

function voltar() {
    document.getElementById("chatScreen").style.display = "none";
    document.getElementById("home").style.display = "flex";
    currentChat = null;
    renderContacts();
}

document.getElementById("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const nome = document.getElementById("username").value.trim();
    const fotoBase64 = document.getElementById("profilePreview").src;
    try {
        const res = await fetch("/api/saveProfile", {
            method: "POST", 
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ id: currentUser.id, username: nome, photo: fotoBase64 })
        });
        if (res.ok) {
            currentUser.username = nome; 
            currentUser.photo = fotoBase64;
            localStorage.setItem("myUserObject", JSON.stringify(currentUser));
            socket.emit("updateProfile", { id: currentUser.id, username: nome, photo: fotoBase64 });
            alert("Perfil Atualizado!");
        }
    } catch (err) { alert("Erro ao salvar."); }
};

document.getElementById("profilePic").onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById("profilePreview").src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }
};

document.getElementById("addFriendBtn").onclick = async () => {
    const id = document.getElementById("addUserId").value.trim();
    if (!id || id === currentUser.id) return alert("ID inválido");
    const res = await fetch(`/api/user/${id}`);
    const user = await res.json();
    if (user.error) return alert("Não encontrado");
    if (!contacts.find(c => c.id === user.id)) {
        contacts.push(user);
        localStorage.setItem("contacts", JSON.stringify(contacts));
        renderContacts();
    }
    document.getElementById("addUserId").value = "";
};
