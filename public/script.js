let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;
let listaOnlineGlobal = [];
let mediaParaEnviar = null; 

// CONTROLE DE PERFORMANCE: Essencial para não processar a mesma mensagem pesada várias vezes
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
    // Reduzi a frequência do timer para poupar bateria e CPU
    setInterval(loadMessages, 3000);
});

// --- LÓGICA DE MÍDIA COM COMPRESSÃO (PARA NÃO ENGASGAR) ---
document.getElementById("addMediaBtn").onclick = () => {
    document.getElementById("mediaInput").click();
};

document.getElementById("mediaInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        if (file.type.startsWith('image')) {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const MAX_WIDTH = 600; // Redimensiona para ser leve
                const scale = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                mediaParaEnviar = {
                    data: canvas.toDataURL("image/jpeg", 0.6), // 60% de qualidade = super rápido
                    type: 'image'
                };
                exibirPreviewMedia();
            };
            img.src = ev.target.result;
        } else {
            mediaParaEnviar = { data: ev.target.result, type: file.type.startsWith('video') ? 'video' : 'audio' };
            exibirPreviewMedia();
        }
    };
    reader.readAsDataURL(file);
};

function exibirPreviewMedia() {
    const container = document.getElementById("mediaPreviewContainer");
    const content = document.getElementById("mediaPreviewContent");
    container.style.display = "flex";
    if (mediaParaEnviar.type === 'image') {
        content.innerHTML = `<img src="${mediaParaEnviar.data}" style="max-height:100px; border-radius:5px;">`;
    } else if (mediaParaEnviar.type === 'video') {
        content.innerHTML = `<video src="${mediaParaEnviar.data}" style="max-height:100px;"></video>`;
    }
    document.getElementById("audioControlBtn").style.display = "none";
    document.getElementById("sendMessageBtn").style.display = "flex";
}

function cancelarEnvioMedia() {
    mediaParaEnviar = null;
    document.getElementById("mediaPreviewContainer").style.display = "none";
    document.getElementById("mediaInput").value = "";
    if (document.getElementById("messageText").value.trim() === "") {
        document.getElementById("audioControlBtn").style.display = "flex";
        document.getElementById("sendMessageBtn").style.display = "none";
    }
}

// --- MICROFONE ---
const audioBtn = document.getElementById("audioControlBtn");
const messageInput = document.getElementById("messageText");
const sendTextBtn = document.getElementById("sendMessageBtn");

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
        document.getElementById("recordBar").style.display = "flex";
        document.getElementById("previewAudioBtn").style.display = "none"; 
        document.getElementById("pauseRecord").style.display = "block";
        iniciarTimer();
    } catch (err) {
        alert("Permita o microfone!");
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
        document.getElementById("previewAudioBtn").style.display = "block";
        document.getElementById("previewAudioBtn").textContent = "▶️";
    }
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
            const payload = { fromId: currentUser.id, toId: currentChat.id, text: "", media: { data: reader.result, type: 'audio' } };
            // Envio otimista para áudio também
            addMessage({...payload, timestamp: Date.now()});
            fetch("/sendMessage", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(payload) });
            document.getElementById("recordBar").style.display = "none";
            audioBlob = null;
        };
    }, 200);
};

// --- MENSAGENS E PERFORMANCE ---

async function loadMessages() {
    if (!currentChat) return;
    const res = await fetch(`/getMessages/${currentUser.id}`);
    const msgs = await res.json();
    const container = document.getElementById("messages");

    // FILTRO LEVE: Pega apenas as últimas 15 mensagens do chat atual
    const filtered = msgs.filter(m => (m.fromId == currentUser.id && m.toId == currentChat.id) || (m.fromId == currentChat.id && m.toId == currentUser.id)).slice(-15);
    
    filtered.forEach(m => {
        const msgId = m._id || m.timestamp;
        if (!mensagensExibidasIds.has(msgId)) {
            addMessage(m);
            mensagensExibidasIds.add(msgId);
            container.scrollTop = container.scrollHeight;
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
        // Estilos fixos evitam que o navegador "re-calcule" a tela toda hora
        if (m.media.type === 'image') mediaHtml = `<img src="${m.media.data}" style="width:200px; border-radius:8px;" loading="lazy" onclick="abrirFullscreen('${m.media.data}', 'image')">`;
        else if (m.media.type === 'video') mediaHtml = `<video src="${m.media.data}" style="width:200px;" controls preload="none"></video>`;
        else if (m.media.type === 'audio') mediaHtml = `<audio src="${m.media.data}" style="width:200px;" controls></audio>`;
    }

    div.innerHTML = `
        <div class="bubble">
            ${mediaHtml}
            ${m.text ? `<div class="msg-body">${m.text}</div>` : ""}
            <span class="time" style="font-size:10px; opacity:0.6; display:block; text-align:right;">${timeStr}</span>
        </div>
    `;
    container.appendChild(div);
}

function abrirChat(user) {
    currentChat = user;
    mensagensExibidasIds.clear(); 
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
}

// ENVIO INSTANTÂNEO (INTERFACE OTIMISTA)
document.getElementById("sendMessageBtn").onclick = async () => {
    const input = document.getElementById("messageText");
    const text = input.value.trim();
    if((!text && !mediaParaEnviar) || !currentChat) return;
    
    const payload = { fromId: currentUser.id, toId: currentChat.id, text, media: mediaParaEnviar, timestamp: Date.now() };
    
    // 1. Mostra na tela na mesma hora
    addMessage(payload);
    document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;

    // 2. Limpa tudo para o usuário sentir velocidade
    input.value = "";
    cancelarEnvioMedia(); 
    
    // 3. Envia para o servidor em "silêncio"
    fetch("/sendMessage", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
    });
};

function renderContacts() {
    const div = document.getElementById("contacts");
    div.innerHTML = "";
    contacts.forEach(user => {
        const isOnline = listaOnlineGlobal.includes(user.id);
        const contactEl = document.createElement("div");
        contactEl.className = `contact`;
        contactEl.style.display = "flex";
        contactEl.style.alignItems = "center";
        contactEl.style.padding = "10px";
        contactEl.innerHTML = `
            <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" loading="lazy" style="width:40px;height:40px;border-radius:50%;margin-right:10px;object-fit:cover;">
            <div style="flex:1;">
                <div style="font-weight:bold;">${user.username}</div>
                <div style="font-size:11px; color:${isOnline ? '#25D366' : 'gray'}">${isOnline ? '● Online' : '● Offline'}</div>
            </div>
        `;
        contactEl.onclick = () => abrirChat(user);
        div.appendChild(contactEl);
    });
}

function abrirFullscreen(src, type) {
    const modal = document.getElementById("fullScreenModal");
    const content = document.getElementById("fullScreenContent");
    content.innerHTML = type === 'image' ? `<img src="${src}" style="max-width:100%;">` : `<video src="${src}" controls autoplay></video>`;
    modal.style.display = "flex";
}

function fecharFullscreen() { 
    document.getElementById("fullScreenModal").style.display = "none";
    document.getElementById("fullScreenContent").innerHTML = "";
}

socket.on("updateStatus", (listaOnline) => {
    listaOnlineGlobal = listaOnline;
    renderContacts();
});
