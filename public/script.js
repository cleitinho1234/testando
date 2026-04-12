let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;
let listaOnlineGlobal = [];
let mediaParaEnviar = null; 

// --- VARIÁVEIS PARA ÁUDIO ---
let mediaRecorder;
let audioChunks = [];
let audioBlob;
let timerInterval;
let seconds = 0;

// --- VARIÁVEIS PARA STATUS (MOMENTOS) ---
let todosMomentos = [];
let momentoAtualIdx = 0;
let intervaloProgresso;

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
    carregarMomentos(); 
    setInterval(loadMessages, 1500);
    setInterval(carregarMomentos, 10000); // Atualiza status a cada 10s
});

// --- LÓGICA DE STATUS (MOMENTOS) ---

document.getElementById("momentInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
        let dadosParaEnviar = ev.target.result;

        if (file.type.startsWith("image")) {
            dadosParaEnviar = await comprimirImagem(ev.target.result, 600, 0.6);
        }

        await fetch("/postMoment", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
                userId: currentUser.id,
                username: currentUser.username,
                userPhoto: currentUser.photo,
                data: dadosParaEnviar,
                type: file.type.startsWith("image") ? "image" : "video"
            })
        });
        carregarMomentos();
    };
    reader.readAsDataURL(file);
};

async function carregarMomentos() {
    try {
        const res = await fetch("/getMoments");
        const momentos = await res.json();
        const IDsContatos = contacts.map(c => String(c.id));
        IDsContatos.push(String(currentUser.id));

        todosMomentos = momentos.filter(m => IDsContatos.includes(String(m.userId)));
        renderizarListaMomentos();
    } catch (e) { console.log("Erro ao carregar status"); }
}

function renderizarListaMomentos() {
    const lista = document.getElementById("momentsList");
    if(!lista) return;
    lista.innerHTML = "";
    const agrupados = {};
    todosMomentos.forEach(m => { if (!agrupados[m.userId]) agrupados[m.userId] = m; });

    Object.values(agrupados).forEach(m => {
        const item = document.createElement("div");
        item.className = "moment-item";
        item.onclick = () => abrirVisualizadorMomentos(m.userId);
        item.innerHTML = `
            <img src="${m.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}">
            <div style="font-size:10px; color:#333; text-align:center; overflow:hidden;">${m.userId == currentUser.id ? "Meu Status" : m.username}</div>
        `;
        lista.appendChild(item);
    });
}

function abrirVisualizadorMomentos(userId) {
    const lista = todosMomentos.filter(m => m.userId == userId);
    if (lista.length === 0) return;
    momentoAtualIdx = 0;
    document.getElementById("momentViewer").style.display = "flex";
    exibirMomento(lista);
}

function exibirMomento(lista) {
    clearInterval(intervaloProgresso);
    const m = lista[momentoAtualIdx];
    const container = document.getElementById("momentContent");
    const progContainer = document.getElementById("momentProgressContainer");
    
    document.getElementById("momentUserName").textContent = m.username;
    document.getElementById("momentUserPhoto").src = m.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

    progContainer.innerHTML = "";
    lista.forEach((_, i) => {
        const bg = document.createElement("div");
        bg.className = "progress-bar-bg";
        const fill = document.createElement("div");
        fill.className = "progress-bar-fill";
        fill.style.width = i < momentoAtualIdx ? "100%" : "0%";
        bg.appendChild(fill);
        progContainer.appendChild(bg);
    });

    if (m.type === "image") {
        container.innerHTML = `<img src="${m.data}" style="max-width:100%; max-height:100%; object-fit:contain;">`;
        iniciarBarra(lista, 5);
    } else {
        container.innerHTML = `<video src="${m.data}" autoplay playsinline style="max-width:100%; max-height:100%;"></video>`;
        const v = container.querySelector("video");
        v.onended = () => proximoMomentoDe(lista);
        iniciarBarra(lista, v.duration || 5);
    }
}

function iniciarBarra(lista, duracao) {
    const barras = document.querySelectorAll(".progress-bar-fill");
    const atual = barras[momentoAtualIdx];
    let start = 0;
    const step = 100 / (duracao * 100);
    intervaloProgresso = setInterval(() => {
        start += step;
        if(atual) atual.style.width = start + "%";
        if (start >= 100) {
            clearInterval(intervaloProgresso);
            proximoMomentoDe(lista);
        }
    }, 10);
}

function proximoMomentoDe(lista) {
    if (momentoAtualIdx < lista.length - 1) {
        momentoAtualIdx++;
        exibirMomento(lista);
    } else { fecharMomentos(); }
}

function fecharMomentos() {
    clearInterval(intervaloProgresso);
    document.getElementById("momentViewer").style.display = "none";
}

// --- PERFIL (COM PROTEÇÃO DE CONTATOS) ---

document.getElementById("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const nome = document.getElementById("username").value.trim();
    const file = document.getElementById("profilePic").files[0];
    if (!nome || !currentUser) return;

    const salvar = async (fotoFinal) => {
        const res = await fetch("/saveProfile", {
            method: "POST", 
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ id: currentUser.id, username: nome, photo: fotoFinal })
        });
        
        if (res.ok) {
            currentUser.username = nome; 
            currentUser.photo = fotoFinal;
            socket.emit("updateProfileVisual", { id: currentUser.id, username: nome, photo: fotoFinal });
            alert("Perfil Atualizado!");
            renderContacts();
        }
    };

    if (file) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const imgComp = await comprimirImagem(ev.target.result, 300, 0.7);
            salvar(imgComp);
        };
        reader.readAsDataURL(file);
    } else { salvar(currentUser.photo); }
};

function comprimirImagem(base64, maxWidth, quality) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const scale = maxWidth / img.width;
            canvas.width = maxWidth;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = base64;
    });
}

// --- MÍDIA E ÁUDIO ---

document.getElementById("addMediaBtn").onclick = () => document.getElementById("mediaInput").click();

document.getElementById("mediaInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        mediaParaEnviar = { data: ev.target.result, type: file.type.startsWith('image') ? 'image' : 'video' };
        exibirPreviewMedia();
    };
    reader.readAsDataURL(file);
};

function exibirPreviewMedia() {
    const container = document.getElementById("mediaPreviewContainer");
    const content = document.getElementById("mediaPreviewContent");
    container.style.display = "flex";
    content.innerHTML = mediaParaEnviar.type === 'image' ? `<img src="${mediaParaEnviar.data}">` : `<video src="${mediaParaEnviar.data}"></video>`;
    audioBtn.style.display = "none";
    sendTextBtn.style.display = "flex";
}

function cancelarEnvioMedia() {
    mediaParaEnviar = null;
    document.getElementById("mediaPreviewContainer").style.display = "none";
    if (messageInput.value.trim() === "") {
        audioBtn.style.display = "flex";
        sendTextBtn.style.display = "none";
    }
}

// Microfone
audioBtn.onclick = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = () => { audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); };
        mediaRecorder.start();
        recordBar.style.display = "flex";
        iniciarTimer();
    } catch (err) { alert("Permita o microfone!"); }
};

function iniciarTimer() {
    seconds = 0;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        seconds++;
        let m = Math.floor(seconds / 60);
        let s = seconds % 60;
        document.getElementById("recordTimer").textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }, 1000);
}

document.getElementById("sendAudioBtn").onclick = async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
    setTimeout(async () => {
        if (!audioBlob) return;
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
            await fetch("/sendMessage", {
                method: "POST",
                headers: {"Content-Type":"application/json"},
                body: JSON.stringify({ fromId: currentUser.id, toId: currentChat.id, text: "", media: { data: reader.result, type: 'audio' }})
            });
            recordBar.style.display = "none";
            loadMessages();
        };
    }, 200);
};

// --- CHAT E CONTATOS (ESTÁVEL) ---

function renderContacts() {
    const div = document.getElementById("contacts");
    div.innerHTML = "";
    contacts.forEach(user => {
        const count = unreadCounts[user.id] || 0;
        const isOnline = listaOnlineGlobal.includes(user.id);
        const contactEl = document.createElement("div");
        contactEl.className = `contact ${contatoSelecionadoId === user.id ? 'selected' : ''}`;
        contactEl.innerHTML = `
            <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}">
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

async function loadMessages() {
    const res = await fetch(`/getMessages/${currentUser.id}`);
    const msgs = await res.json();
    const container = document.getElementById("messages");

    for (let m of msgs) {
        if (m.timestamp > lastTimestamp) {
            lastTimestamp = m.timestamp;
            if (m.toId == currentUser.id) {
                if (!contacts.some(c => c.id == m.fromId)) {
                    const resU = await fetch(`/getUser/${m.fromId}`);
                    const nU = await resU.json();
                    if (!nU.error) contacts.unshift(nU);
                }
                if (!currentChat || currentChat.id != m.fromId) unreadCounts[m.fromId] = (unreadCounts[m.fromId] || 0) + 1;
            }
        }
    }

    localStorage.setItem("lastTimestamp", lastTimestamp);
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

function addMessage(m) {
    const container = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
    let mediaHtml = "";
    if (m.media) {
        if (m.media.type === 'image') mediaHtml = `<img src="${m.media.data}" onclick="abrirFullscreen('${m.media.data}', 'image')">`;
        else if (m.media.type === 'video') mediaHtml = `<video src="${m.media.data}" controls></video>`;
        else if (m.media.type === 'audio') mediaHtml = `<audio src="${m.media.data}" controls></audio>`;
    }
    div.innerHTML = `<div class="bubble">${mediaHtml}<div>${m.text || ""}</div></div>`;
    container.appendChild(div);
}

function abrirChat(user) {
    currentChat = user;
    unreadCounts[user.id] = 0;
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
}

document.getElementById("sendMessageBtn").onclick = async () => {
    const text = messageInput.value.trim();
    if (!text && !mediaParaEnviar) return;
    const payload = { fromId: currentUser.id, toId: currentChat.id, text, media: mediaParaEnviar };
    messageInput.value = "";
    cancelarEnvioMedia();
    await fetch("/sendMessage", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(payload) });
    loadMessages();
};
