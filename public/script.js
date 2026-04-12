let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;
let listaOnlineGlobal = [];
let mediaParaEnviar = null; 

// CONTROLE DE PERFORMANCE: Impede que mensagens já exibidas sejam processadas de novo
let mensagensExibidasIds = new Set();

// --- VARIÁVEIS PARA ÁUDIO ---
let mediaRecorder;
let audioChunks = [];
let audioBlob;
let timerInterval;
let seconds = 0;

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
    // Intervalo de segurança para mensagens
    setInterval(loadMessages, 2000);
});

// --- LÓGICA DE MÍDIA ---
document.getElementById("addMediaBtn").onclick = () => {
    document.getElementById("mediaInput").click();
};

document.getElementById("mediaInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        mediaParaEnviar = {
            data: ev.target.result,
            type: file.type.startsWith('image') ? 'image' : 'video'
        };
        exibirPreviewMedia();
    };
    reader.readAsDataURL(file);
};

function exibirPreviewMedia() {
    const container = document.getElementById("mediaPreviewContainer");
    const content = document.getElementById("mediaPreviewContent");
    container.style.display = "flex";
    if (mediaParaEnviar.type === 'image') {
        content.innerHTML = `<img src="${mediaParaEnviar.data}">`;
    } else if (mediaParaEnviar.type === 'video') {
        content.innerHTML = `<video src="${mediaParaEnviar.data}"></video>`;
    }
    audioBtn.style.display = "none";
    sendTextBtn.style.display = "flex";
}

function cancelarEnvioMedia() {
    mediaParaEnviar = null;
    document.getElementById("mediaPreviewContainer").style.display = "none";
    document.getElementById("mediaInput").value = "";
    if (messageInput.value.trim() === "") {
        audioBtn.style.display = "flex";
        sendTextBtn.style.display = "none";
    }
}

// --- LÓGICA DO MICROFONE ---
const audioBtn = document.getElementById("audioControlBtn");
const messageInput = document.getElementById("messageText");
const sendTextBtn = document.getElementById("sendMessageBtn");
const recordBar = document.getElementById("recordBar");
const previewAudioBtn = document.getElementById("previewAudioBtn");

messageInput.oninput = () => {
    const temTexto = messageInput.value.trim() !== "";
    if (temTexto || mediaParaEnviar) {
        audioBtn.style.display = "none";
        sendTextBtn.style.display = "flex";
    } else {
        audioBtn.style.display = "flex";
        sendTextBtn.style.display = "none";
    }
};

audioBtn.onclick = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.onstop = () => { audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); };
        mediaRecorder.start();
        recordBar.style.display = "flex";
        previewAudioBtn.style.display = "none"; 
        document.getElementById("pauseRecord").style.display = "block";
        iniciarTimer();
    } catch (err) {
        alert("Permita o microfone nas configurações!");
    }
};

function iniciarTimer() {
    seconds = 0;
    document.getElementById("recordTimer").textContent = "0:00";
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        seconds++;
        let m = Math.floor(seconds / 60);
        let s = seconds % 60;
        document.getElementById("recordTimer").textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }, 1000);
}

function pararMicrofone() {
    if (mediaRecorder && mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

document.getElementById("pauseRecord").onclick = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        pararMicrofone();
        clearInterval(timerInterval);
        document.getElementById("pauseRecord").style.display = "none";
        previewAudioBtn.style.display = "block";
        previewAudioBtn.textContent = "▶️";
    }
};

previewAudioBtn.onclick = () => {
    if (audioBlob) {
        const url = URL.createObjectURL(audioBlob);
        const previewAudio = new Audio(url);
        previewAudio.play();
        previewAudioBtn.textContent = "🔊";
        previewAudio.onended = () => { previewAudioBtn.textContent = "▶️"; };
    }
};

document.getElementById("deleteAudio").onclick = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
    pararMicrofone();
    recordBar.style.display = "none";
    clearInterval(timerInterval);
    audioBlob = null;
};

document.getElementById("sendAudioBtn").onclick = async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        pararMicrofone();
    }
    setTimeout(async () => {
        if (!audioBlob) return;
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
            const payload = {
                fromId: currentUser.id,
                toId: currentChat.id,
                text: "",
                media: { data: reader.result, type: 'audio' }
            };
            await fetch("/sendMessage", {
                method: "POST",
                headers: {"Content-Type":"application/json"},
                body: JSON.stringify(payload)
            });
            recordBar.style.display = "none";
            audioBlob = null;
            loadMessages();
        };
    }, 200);
};

// --- CONTATOS E SOCKETS ---
socket.on("updateStatus", (listaOnline) => {
    listaOnlineGlobal = listaOnline;
    renderContacts();
});

function renderContacts() {
    const div = document.getElementById("contacts");
    div.innerHTML = "";
    contacts.forEach(user => {
        const count = unreadCounts[user.id] || 0;
        const isOnline = listaOnlineGlobal.includes(user.id);
        const contactEl = document.createElement("div");
        contactEl.className = `contact ${contatoSelecionadoId === user.id ? 'selected' : ''}`;
        contactEl.style.display = "flex";
        contactEl.style.alignItems = "center";
        contactEl.innerHTML = `
            <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" loading="lazy" style="width:40px;height:40px;border-radius:50%;margin-right:10px;object-fit:cover;">
            <div style="flex:1;">
                <div style="font-weight:bold;">${user.username}</div>
                <div style="font-size:11px; color:${isOnline ? '#25D366' : 'gray'}">${isOnline ? '● Online' : '● Offline'}</div>
            </div>
            ${count > 0 ? `<span style="background:red;color:white;border-radius:50%;padding:2px 8px;font-size:12px;">${count}</span>` : ""}
        `;
        contactEl.onclick = () => { if (!contatoSelecionadoId) abrirChat(user); };
        div.appendChild(contactEl);
    });
}

// --- MENSAGENS OTIMIZADAS ---
async function loadMessages() {
    const res = await fetch(`/getMessages/${currentUser.id}`);
    const msgs = await res.json();
    const container = document.getElementById("messages");
    const estaNoFinal = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
    
    // Atualiza contatos e notificações
    msgs.forEach(m => {
        if (m.timestamp > lastTimestamp) {
            lastTimestamp = m.timestamp;
            if (m.toId == currentUser.id && (!currentChat || currentChat.id != m.fromId)) {
                unreadCounts[m.fromId] = (unreadCounts[m.fromId] || 0) + 1;
            }
        }
    });

    localStorage.setItem("lastTimestamp", lastTimestamp);
    localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
    renderContacts();

    if (!currentChat) return;

    // Adiciona apenas o que ainda não está na tela
    const filtered = msgs.filter(m => (m.fromId == currentUser.id && m.toId == currentChat.id) || (m.fromId == currentChat.id && m.toId == currentUser.id));
    
    filtered.forEach(m => {
        const msgId = m._id || m.timestamp;
        if (!mensagensExibidasIds.has(msgId)) {
            addMessage(m);
            mensagensExibidasIds.add(msgId);
            if (estaNoFinal) container.scrollTop = container.scrollHeight;
        }
    });
}

function addMessage(m) {
    const container = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
    const date = new Date(m.timestamp);
    const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    let mediaHtml = "";
    if (m.media) {
        if (m.media.type === 'image') mediaHtml = `<img src="${m.media.data}" loading="lazy" onclick="abrirFullscreen('${m.media.data}', 'image')">`;
        else if (m.media.type === 'video') mediaHtml = `<video src="${m.media.data}" controls preload="metadata"></video>`;
        else if (m.media.type === 'audio') mediaHtml = `<audio src="${m.media.data}" controls></audio>`;
    }

    div.innerHTML = `
        <div class="bubble">
            ${mediaHtml}
            <div class="msg-body">${m.text || ""}</div>
            <span class="time">${timeStr}</span>
        </div>
    `;
    container.appendChild(div);
}

function abrirChat(user) {
    currentChat = user;
    mensagensExibidasIds.clear(); 
    unreadCounts[user.id] = 0; 
    document.getElementById("home").style.display = "none";
    document.getElementById("chatScreen").style.display = "flex";
    document.getElementById("chatName").textContent = user.username;
    document.getElementById("chatAvatar").src = user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById("messages").innerHTML = ""; 
    loadMessages();
}

function voltar() {
    document.getElementById("chatScreen").style.display = "none";
    document.getElementById("home").style.display = "block";
    currentChat = null;
    mensagensExibidasIds.clear();
    cancelarEnvioMedia();
    renderContacts();
}

document.getElementById("sendMessageBtn").onclick = async () => {
    const input = document.getElementById("messageText");
    const text = input.value.trim();
    if((!text && !mediaParaEnviar) || !currentChat) return;
    
    const payload = { fromId: currentUser.id, toId: currentChat.id, text, media: mediaParaEnviar };
    input.value = "";
    audioBtn.style.display = "flex";
    sendTextBtn.style.display = "none";
    cancelarEnvioMedia(); 
    
    await fetch("/sendMessage", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
    });
    loadMessages();
};

// Funções de perfil e fullscreen mantidas conforme original...
function abrirFullscreen(src, type) {
    const modal = document.getElementById("fullScreenModal");
    const content = document.getElementById("fullScreenContent");
    content.innerHTML = type === 'image' ? `<img src="${src}">` : `<video src="${src}" controls autoplay></video>`;
    modal.style.display = "flex";
}
function fecharFullscreen() { 
    document.getElementById("fullScreenModal").style.display = "none";
    document.getElementById("fullScreenContent").innerHTML = "";
}
