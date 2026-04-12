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

// --- VARIÁVEIS PARA MOMENTOS ---
let todosMomentos = []; // Lista global de momentos recebida do servidor
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
    carregarMomentos(); // Inicializa momentos
    setInterval(loadMessages, 1500);
    setInterval(carregarMomentos, 10000); // Atualiza momentos a cada 10s
});

// --- LÓGICA DE MOMENTOS (POSTAR E EXIBIR) ---

document.getElementById("momentInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
        let dadosParaEnviar = ev.target.result;

        // Se for imagem, comprimir antes de postar
        if (file.type.startsWith("image")) {
            dadosParaEnviar = await comprimirImagem(ev.target.result, 600, 0.6);
        }

        const res = await fetch("/postMoment", {
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

        if (res.ok) {
            alert("Momento postado!");
            carregarMomentos();
        }
    };
    reader.readAsDataURL(file);
};

async function carregarMomentos() {
    const res = await fetch("/getMoments");
    const momentos = await res.json();
    
    // Filtra para mostrar apenas seus momentos ou de seus contatos
    const IDsContatos = contacts.map(c => String(c.id));
    IDsContatos.push(String(currentUser.id));

    todosMomentos = momentos.filter(m => IDsContatos.includes(String(m.userId)));
    renderizarListaMomentos();
}

function renderizarListaMomentos() {
    const lista = document.getElementById("momentsList");
    lista.innerHTML = "";

    // Agrupar momentos por usuário para a lista
    const agrupados = {};
    todosMomentos.forEach(m => {
        if (!agrupados[m.userId]) agrupados[m.userId] = m;
    });

    Object.values(agrupados).forEach(m => {
        const item = document.createElement("div");
        item.className = "moment-item";
        item.onclick = () => abrirVisualizadorMomentos(m.userId);
        item.innerHTML = `
            <img src="${m.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}">
            <div style="font-size:11px; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:65px;">
                ${m.userId == currentUser.id ? "Meu Momento" : m.username}
            </div>
        `;
        lista.appendChild(item);
    });
}

function abrirVisualizadorMomentos(userId) {
    const momentosDoUser = todosMomentos.filter(m => m.userId == userId);
    if (momentosDoUser.length === 0) return;

    momentoAtualIdx = 0;
    const viewer = document.getElementById("momentViewer");
    viewer.style.display = "flex";

    exibirMomento(momentosDoUser);
}

function exibirMomento(lista) {
    clearInterval(intervaloProgresso);
    const m = lista[momentoAtualIdx];
    const container = document.getElementById("momentContent");
    const progContainer = document.getElementById("momentProgressContainer");
    
    document.getElementById("momentUserName").textContent = m.username;
    document.getElementById("momentUserPhoto").src = m.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

    // Criar barrinhas de progresso
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

    // Conteúdo
    if (m.type === "image") {
        container.innerHTML = `<img src="${m.data}" style="max-width:100%; max-height:100%; object-fit:contain;">`;
        iniciarBarra(lista);
    } else {
        container.innerHTML = `<video src="${m.data}" autoplay playsinline style="max-width:100%; max-height:100%;"></video>`;
        const v = container.querySelector("video");
        v.onended = () => proximoMomentoDe(lista);
        // Barra segue o tempo do vídeo ou 5s se falhar
        iniciarBarra(lista, v.duration || 5);
    }
}

function iniciarBarra(lista, duracao = 5) {
    const barras = document.querySelectorAll(".progress-bar-fill");
    const atual = barras[momentoAtualIdx];
    let start = 0;
    const step = 100 / (duracao * 100);

    intervaloProgresso = setInterval(() => {
        start += step;
        atual.style.width = start + "%";
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
    } else {
        fecharMomentos();
    }
}

// Funções globais de navegação chamadas pelo HTML
window.proximoMomento = () => {
    const listaAtual = todosMomentos.filter(m => m.username === document.getElementById("momentUserName").textContent);
    proximoMomentoDe(listaAtual);
};

window.momentoAnterior = () => {
    const listaAtual = todosMomentos.filter(m => m.username === document.getElementById("momentUserName").textContent);
    if (momentoAtualIdx > 0) {
        momentoAtualIdx--;
        exibirMomento(listaAtual);
    }
};

window.fecharMomentos = () => {
    clearInterval(intervaloProgresso);
    document.getElementById("momentViewer").style.display = "none";
    document.getElementById("momentContent").innerHTML = "";
};

// --- FUNÇÃO AUXILIAR: COMPRESSÃO ---
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

// --- RESTANTE DO CÓDIGO (ÁUDIO, MÍDIA, CHAT) ---

document.getElementById("addMediaBtn").onclick = () => document.getElementById("mediaInput").click();

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
    content.innerHTML = mediaParaEnviar.type === 'image' 
        ? `<img src="${mediaParaEnviar.data}">` 
        : `<video src="${mediaParaEnviar.data}"></video>`;
    
    document.getElementById("audioControlBtn").style.display = "none";
    document.getElementById("sendMessageBtn").style.display = "flex";
}

function cancelarEnvioMedia() {
    mediaParaEnviar = null;
    document.getElementById("mediaPreviewContainer").style.display = "none";
    document.getElementById("mediaInput").value = "";
    if (messageInput.value.trim() === "") {
        document.getElementById("audioControlBtn").style.display = "flex";
        document.getElementById("sendMessageBtn").style.display = "none";
    }
}

// Áudio
const audioBtn = document.getElementById("audioControlBtn");
const messageInput = document.getElementById("messageText");
const sendTextBtn = document.getElementById("sendMessageBtn");

messageInput.oninput = () => {
    const temConteudo = messageInput.value.trim() !== "" || mediaParaEnviar;
    audioBtn.style.display = temConteudo ? "none" : "flex";
    sendTextBtn.style.display = temConteudo ? "flex" : "none";
};

audioBtn.onclick = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = () => { audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); };
        mediaRecorder.start();
        document.getElementById("recordBar").style.display = "flex";
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
                body: JSON.stringify({
                    fromId: currentUser.id, toId: currentChat.id,
                    text: "", media: { data: reader.result, type: 'audio' }
                })
            });
            document.getElementById("recordBar").style.display = "none";
            loadMessages();
        };
    }, 200);
};

// ... (Funções de Socket, Contatos e Chat permanecem as mesmas que as suas) ...

async function loadMessages() {
    const res = await fetch(`/getMessages/${currentUser.id}`);
    const msgs = await res.json();
    const container = document.getElementById("messages");
    if (!currentChat) {
        // Lógica de contatos e unreadCounts conforme seu código original
        return;
    }
    const filtered = msgs.filter(m => (m.fromId == currentUser.id && m.toId == currentChat.id) || (m.fromId == currentChat.id && m.toId == currentUser.id));
    if (container.children.length !== filtered.length) {
        container.innerHTML = "";
        filtered.forEach(addMessage);
        container.scrollTop = container.scrollHeight;
    }
}

function addMessage(m) {
    const container = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
    
    let mediaHtml = "";
    if (m.media) {
        if (m.media.type === 'image') mediaHtml = `<img src="${m.media.data}" onclick="abrirFullscreen('${m.media.data}', 'image')" style="width:100%; border-radius:8px;">`;
        else if (m.media.type === 'video') mediaHtml = `<video src="${m.media.data}" controls style="width:100%; border-radius:8px;"></video>`;
        else if (m.media.type === 'audio') mediaHtml = `<audio src="${m.media.data}" controls style="max-width:200px;"></audio>`;
    }

    div.innerHTML = `
        <div class="bubble">
            ${mediaHtml}
            <div class="msg-body">${m.text || ""}</div>
            <span class="time">${new Date(m.timestamp).getHours()}:${new Date(m.timestamp).getMinutes()}</span>
        </div>
    `;
    container.appendChild(div);
}

document.getElementById("sendMessageBtn").onclick = async () => {
    const text = messageInput.value.trim();
    if (!text && !mediaParaEnviar) return;
    const payload = { fromId: currentUser.id, toId: currentChat.id, text, media: mediaParaEnviar };
    messageInput.value = "";
    cancelarEnvioMedia();
    await fetch("/sendMessage", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
    });
    loadMessages();
};

function abrirChat(user) {
    currentChat = user;
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

// Funções de addFriend e profileForm permanecem as mesmas.
