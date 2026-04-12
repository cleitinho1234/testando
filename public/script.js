let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;
let listaOnlineGlobal = [];
let mediaParaEnviar = null; 

// --- VARIÁVEIS PARA ÁUDIO E LIGAÇÃO ---
let mediaRecorder;
let audioChunks = [];
let audioBlob;
let timerInterval;
let seconds = 0;
const ringtone = document.getElementById("ringtone");
let chamandoAgora = null;

// VARIÁVEIS WebRTC
let peer = null;
let streamLocal = null;

window.addEventListener("load", async () => {
    let savedId = localStorage.getItem("userId");
    if (savedId) {
        const res = await fetch(`/getUser/${savedId}`);
        const user = await res.json();
        if (!user.error) currentUser = user;
    }
    if (!currentUser) {
        const res = await fetch("/user", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ username: "Novo Usuário", photo: "" })
        });
        currentUser = await res.json();
        localStorage.setItem("userId", currentUser.id);
    }
    socket.emit("register", currentUser.id);
    document.getElementById("username").value = currentUser.username || "";
    document.getElementById("userIdDisplay").textContent = currentUser.id;
    
    if(currentUser.photo) document.getElementById("profilePreview").src = currentUser.photo;

    const preview = document.getElementById("profilePreview");
    const fileInput = document.getElementById("profilePic");
    preview.onclick = () => fileInput.click();

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => { preview.src = ev.target.result; };
            reader.readAsDataURL(file);
        }
    };

    renderContacts();
    setInterval(loadMessages, 1500);
});

// --- LÓGICA DE LIGAÇÃO E VOZ WebRTC ---

async function obterMediaPrivado() {
    try {
        if (streamLocal) streamLocal.getTracks().forEach(t => t.stop());
        streamLocal = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        return streamLocal;
    } catch (err) {
        alert("Erro ao acessar microfone: " + err);
        return null;
    }
}

async function iniciarChamada() {
    if (!currentChat) return;
    const stream = await obterMediaPrivado();
    if (!stream) return;
    if (peer) peer.destroy();

    peer = new SimplePeer({ initiator: true, trickle: false, stream: streamLocal });

    peer.on('signal', sinal => {
        socket.emit("ligarPara", {
            de: currentUser.id,
            deNome: currentUser.username,
            deFoto: currentUser.photo,
            para: currentChat.id,
            sinal: sinal 
        });
    });

    peer.on('stream', streamRemota => {
        const audioRemoto = new Audio();
        audioRemoto.srcObject = streamRemota;
        audioRemoto.play();
    });

    abrirTelaChamada(currentChat.username, currentChat.photo, "Chamando...");
    document.getElementById("btnAceitar").style.display = "none";
    ringtone.play().catch(e => console.log("Áudio bloqueado"));
}

socket.on("recebendoLigacao", (dados) => {
    chamandoAgora = dados;
    abrirTelaChamada(dados.deNome, dados.deFoto, "Recebendo chamada...");
    document.getElementById("btnAceitar").style.display = "flex";
    ringtone.play().catch(e => console.log("Áudio bloqueado"));
});

socket.on("chamadaAceita", (dados) => {
    ringtone.pause();
    ringtone.currentTime = 0;
    document.getElementById("callStatusText").textContent = "Em chamada...";
    if (dados && dados.sinal && peer) peer.signal(dados.sinal);
});

async function aceitarChamada() {
    if(!chamandoAgora) return;
    ringtone.pause();
    ringtone.currentTime = 0;
    document.getElementById("btnAceitar").style.display = "none";
    
    const stream = await obterMediaPrivado();
    if (!stream) return;
    if (peer) peer.destroy();

    peer = new SimplePeer({ initiator: false, trickle: false, stream: streamLocal });

    peer.on('signal', sinal => {
        socket.emit("aceitarChamada", { para: chamandoAgora.de, sinal: sinal });
        document.getElementById("callStatusText").textContent = "Em chamada...";
    });

    peer.on('stream', streamRemota => {
        const audioRemoto = new Audio();
        audioRemoto.srcObject = streamRemota;
        audioRemoto.play();
    });

    peer.signal(chamandoAgora.sinal);
}

function recusarChamada() {
    ringtone.pause();
    ringtone.currentTime = 0;
    document.getElementById("incomingCallScreen").style.display = "none";
    if (streamLocal) streamLocal.getTracks().forEach(t => t.stop());
    
    const destino = chamandoAgora ? chamandoAgora.de : (currentChat ? currentChat.id : null);
    if (destino) socket.emit("chamadaRecusada", { para: destino });
    
    if (peer) { peer.destroy(); peer = null; }
    chamandoAgora = null;
}

socket.on("chamadaEncerrada", () => {
    ringtone.pause();
    ringtone.currentTime = 0;
    document.getElementById("incomingCallScreen").style.display = "none";
    if (streamLocal) streamLocal.getTracks().forEach(t => t.stop());
    if (peer) { peer.destroy(); peer = null; }
    chamandoAgora = null;
});

function abrirTelaChamada(nome, foto, status) {
    document.getElementById("callerName").textContent = nome;
    document.getElementById("callerPhoto").src = foto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById("callStatusText").textContent = status;
    document.getElementById("incomingCallScreen").style.display = "flex";
}

// --- GESTÃO DE CONTATOS E INTERFACE ---

function renderContacts() {
    const div = document.getElementById("contacts");
    if(!div) return;
    div.innerHTML = "";
    contacts.forEach(user => {
        const count = unreadCounts[user.id] || 0;
        const isOnline = listaOnlineGlobal.includes(user.id);
        const isSelected = contatoSelecionadoId === user.id;

        const contactEl = document.createElement("div");
        contactEl.className = `contact ${isSelected ? 'selected' : ''}`;
        contactEl.style.display = "flex";
        contactEl.style.alignItems = "center";
        contactEl.innerHTML = `
            <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" style="width:40px;height:40px;border-radius:50%;margin-right:10px;object-fit:cover;">
            <div style="flex:1;">
                <div style="font-weight:bold;">${user.username}</div>
                <div style="font-size:11px; color:${isOnline ? '#25D366' : 'gray'}">${isOnline ? '● Online' : '● Offline'}</div>
            </div>
            ${count > 0 ? `<span style="background:red;color:white;border-radius:50%;padding:2px 8px;font-size:12px;">${count}</span>` : ""}
        `;

        let pressTimer;
        contactEl.onmousedown = () => pressTimer = setTimeout(() => ativarSelecao(user.id), 800);
        contactEl.onmouseup = () => clearTimeout(pressTimer);
        
        contactEl.onclick = () => {
            if (contatoSelecionadoId) cancelarSelecao();
            else abrirChat(user);
        };
        div.appendChild(contactEl);
    });
}

function ativarSelecao(id) {
    contatoSelecionadoId = id;
    document.getElementById("headerSelecao").style.display = "flex";
    renderContacts();
}

function cancelarSelecao() {
    contatoSelecionadoId = null;
    document.getElementById("headerSelecao").style.display = "none";
    renderContacts();
}

// Funções globais para botões do HTML
window.abrirModal = () => document.getElementById("confirmModal").style.display = "flex";
window.fecharModal = () => document.getElementById("confirmModal").style.display = "none";
window.confirmarExclusao = () => {
    contacts = contacts.filter(c => c.id !== contatoSelecionadoId);
    localStorage.setItem("contacts", JSON.stringify(contacts));
    fecharModal();
    cancelarSelecao();
};

async function loadMessages() {
    if (!currentUser) return;
    const res = await fetch(`/getMessages/${currentUser.id}`);
    const msgs = await res.json();
    const container = document.getElementById("messages");

    for (let m of msgs) {
        if (m.timestamp > lastTimestamp) {
            lastTimestamp = m.timestamp;
            if (m.toId == currentUser.id) {
                const idx = contacts.findIndex(c => c.id == m.fromId);
                if (idx === -1) {
                    const rU = await fetch(`/getUser/${m.fromId}`);
                    const nU = await rU.json();
                    if (!nU.error) contacts.unshift(nU);
                }
                if (!currentChat || currentChat.id != m.fromId) {
                    unreadCounts[m.fromId] = (unreadCounts[m.fromId] || 0) + 1;
                }
            }
        }
    }

    localStorage.setItem("lastTimestamp", lastTimestamp);
    localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
    localStorage.setItem("contacts", JSON.stringify(contacts));
    renderContacts();

    if (currentChat) {
        const filtered = msgs.filter(m => (m.fromId == currentUser.id && m.toId == currentChat.id) || (m.fromId == currentChat.id && m.toId == currentUser.id));
        if (container.children.length !== filtered.length) {
            container.innerHTML = "";
            filtered.forEach(addMessage);
            container.scrollTop = container.scrollHeight;
        }
    }
}

function abrirChat(user) {
    currentChat = user;
    unreadCounts[user.id] = 0;
    localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
    document.getElementById("home").style.display = "none";
    document.getElementById("chatScreen").style.display = "flex";
    document.getElementById("chatName").textContent = user.username;
    document.getElementById("chatAvatar").src = user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    loadMessages();
}

function voltar() {
    document.getElementById("chatScreen").style.display = "none";
    document.getElementById("home").style.display = "block";
    currentChat = null;
    renderContacts();
}

function addMessage(m) {
    const container = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
    const date = new Date(m.timestamp);
    const hora = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    
    let mediaHtml = "";
    if (m.media) {
        if (m.media.type === 'audio') mediaHtml = `<audio src="${m.media.data}" controls></audio>`;
        else if (m.media.type === 'image') mediaHtml = `<img src="${m.media.data}" style="max-width:200px; border-radius:10px;">`;
    }

    div.innerHTML = `<div class="bubble">${mediaHtml}<div>${m.text || ""}</div><span class="time">${hora}</span></div>`;
    container.appendChild(div);
}

socket.on("updateStatus", (lista) => {
    listaOnlineGlobal = lista;
    renderContacts();
});

// Envio de Texto
document.getElementById("sendMessageBtn").onclick = async () => {
    const input = document.getElementById("messageText");
    const text = input.value.trim();
    if(!text || !currentChat) return;
    
    await fetch("/sendMessage", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ fromId: currentUser.id, toId: currentChat.id, text })
    });
    input.value = "";
    loadMessages();
};
