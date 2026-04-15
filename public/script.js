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
    
    // Solicita permissão inicial para evitar bloqueios silenciosos
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Fecha o microfone após testar
        console.log("Hardware de áudio pronto.");
    } catch (err) {
        console.warn("Aviso: Microfone não detectado ou permissão negada.");
    }

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
    setInterval(loadMessages, 1500);
});

// --- LÓGICA DE LIGAÇÃO (VOZ) ---

socket.on("iceCandidate", async (data) => {
    try {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (e) { console.error("Erro ao adicionar ICE:", e); }
});

async function iniciarChamada() {
    if (!currentChat) return;
    
    contatoSelecionadoId = currentChat.id;
    mostrarTelaChamada(currentChat.username, currentChat.photo, "Chamando...");

    try {
        // Tenta capturar o áudio (falha se não houver microfone/fone conectado)
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        document.getElementById("localAudio").srcObject = localStream;

        peerConnection = new RTCPeerConnection(rtcConfig);
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("iceCandidate", { toId: contatoSelecionadoId, candidate: event.candidate });
            }
        };

        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = (event) => {
            const remoteAudio = document.getElementById("remoteAudio");
            remoteAudio.srcObject = event.streams[0];
            remoteAudio.play().catch(e => console.error("Erro autoplay:", e));
            document.getElementById("callStatusText").textContent = "Em linha";
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit("callUser", {
            toId: contatoSelecionadoId,
            fromName: currentUser.username,
            fromPhoto: currentUser.photo,
            fromId: currentUser.id,
            signal: offer
        });
    } catch (err) {
        console.error("Erro ao iniciar chamada:", err);
        alert("Erro: Não foi possível acessar o microfone. Verifique se o fone está conectado corretamente.");
        document.getElementById("callScreen").style.display = "none";
    }
}

socket.on("incomingCall", (data) => {
    contatoSelecionadoId = data.fromId; 
    mostrarTelaChamada(data.fromName, data.fromPhoto, "Recebendo ligação...");
    document.getElementById("btnAtender").style.display = "block";
    window.incomingSignal = data.signal;
});

async function atenderChamada() {
    document.getElementById("btnAtender").style.display = "none";
    document.getElementById("callStatusText").textContent = "Conectando...";

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        document.getElementById("localAudio").srcObject = localStream;

        peerConnection = new RTCPeerConnection(rtcConfig);

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("iceCandidate", { toId: contatoSelecionadoId, candidate: event.candidate });
            }
        };

        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = (event) => {
            const remoteAudio = document.getElementById("remoteAudio");
            remoteAudio.srcObject = event.streams[0];
            remoteAudio.play().catch(e => console.error("Erro autoplay:", e));
            document.getElementById("callStatusText").textContent = "Em linha";
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(window.incomingSignal));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit("acceptCall", { 
            toId: contatoSelecionadoId, 
            signal: answer 
        });
        
    } catch (err) {
        console.error("Erro ao atender:", err);
        alert("Erro: Conecte um fone ou microfone para atender.");
        desligarChamada();
    }
}

socket.on("callAccepted", async (data) => {
    if (data.signal && peerConnection) {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
            document.getElementById("callStatusText").textContent = "Em linha";
        } catch (e) { 
            console.error("Erro ao finalizar circuito de áudio:", e); 
        }
    }
});

function mostrarTelaChamada(nome, foto, status) {
    document.getElementById("callScreen").style.display = "flex";
    document.getElementById("callName").textContent = nome;
    document.getElementById("callPhoto").src = foto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById("callStatusText").textContent = status;
}

function desligarChamada() {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (peerConnection) peerConnection.close();
    
    const idDestino = contatoSelecionadoId || (currentChat ? currentChat.id : null);
    if (idDestino) socket.emit("endCall", { toId: idDestino });
    
    document.getElementById("callScreen").style.display = "none";
    contatoSelecionadoId = null;
    peerConnection = null;
    localStream = null;
}

socket.on("callEnded", () => {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (peerConnection) peerConnection.close();
    document.getElementById("callScreen").style.display = "none";
    peerConnection = null;
    contatoSelecionadoId = null;
    localStream = null;
});

function toggleVivaVoz() {
    const audioRemoto = document.getElementById("remoteAudio");
    isVivaVoz = !isVivaVoz;
    
    if (isVivaVoz) {
        audioRemoto.volume = 1.0;
        document.getElementById("btnVivaVoz").textContent = "VIVA-VOZ: ON";
        document.getElementById("btnVivaVoz").style.background = "#25D366";
    } else {
        audioRemoto.volume = 0.5;
        document.getElementById("btnVivaVoz").textContent = "VIVA-VOZ: OFF";
        document.getElementById("btnVivaVoz").style.background = "rgba(255,255,255,0.2)";
    }
}

// --- RESTO DO CÓDIGO (STATUS, MENSAGENS E PERFIL) MANTIDOS IGUAIS ---

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
            ${count > 0 ? `<span class="badge" style="background:#25D366; color:white; border-radius:50%; padding:2px 6px; font-size:10px;">${count}</span>` : ""}
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
    loadMessages();
    renderContacts();
}

async function loadMessages() {
    if(!currentUser || !currentChat) return;
    try {
        const res = await fetch(`/api/messages/${currentUser.id}/${currentChat.id}`);
        const msgs = await res.json();
        const container = document.getElementById("messages");
        if (container.childElementCount !== msgs.length) {
            container.innerHTML = "";
            msgs.forEach(m => {
                const div = document.createElement("div");
                div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
                div.innerHTML = `<div class="bubble">${m.text}</div>`;
                container.appendChild(div);
            });
            container.scrollTop = container.scrollHeight;
        }
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
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Salvando...";
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
    finally {
        btn.disabled = false;
        btn.textContent = "SALVAR PERFIL";
    }
};

document.getElementById("profilePic").onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.src = ev.target.result;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const MAX_WIDTH = 200; 
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                document.getElementById("profilePreview").src = canvas.toDataURL("image/jpeg", 0.7);
            };
        };
        reader.readAsDataURL(file);
    }
};

socket.on("userUpdated", (dados) => {
    const index = contacts.findIndex(c => c.id === dados.id);
    if (index !== -1) {
        contacts[index].username = dados.username;
        contacts[index].photo = dados.photo;
        localStorage.setItem("contacts", JSON.stringify(contacts));
        renderContacts();
        if(currentChat && currentChat.id === dados.id) {
            document.getElementById("chatName").textContent = dados.username;
            document.getElementById("chatAvatar").src = dados.photo;
        }
    }
});

socket.on("receiveMessage", (data) => {
    const { sender } = data;
    const index = contacts.findIndex(c => c.id === sender.id);
    if (index === -1) {
        contacts.unshift(sender);
    } else {
        contacts[index].username = sender.username;
        contacts[index].photo = sender.photo;
    }
    localStorage.setItem("contacts", JSON.stringify(contacts));
    if (!currentChat || currentChat.id !== sender.id) {
        unreadCounts[sender.id] = (unreadCounts[sender.id] || 0) + 1;
        localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
    }
    renderContacts();
    if (currentChat && currentChat.id === sender.id) loadMessages();
});

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
