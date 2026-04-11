let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
let fotoParaEnviar = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let listaOnlineGlobal = [];
let tempoStatus; 

function aplicarTrava(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.addEventListener("touchstart", function() { if (el.scrollTop <= 0) el.scrollTop = 1; }, { passive: true });
}

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
    if(currentUser.photo) {
        document.getElementById("profilePreview").src = currentUser.photo;
        document.getElementById("minhaFotoMomento").src = currentUser.photo;
    }

    renderContacts();
    loadMomentos(); 
    setInterval(loadMessages, 1500);
    setInterval(loadMomentos, 30000); 
    aplicarTrava("messages");
});

// --- ADICIONAR POR ID (FIXED) ---
document.getElementById("addFriendBtn").onclick = async () => {
    const idInput = document.getElementById("addUserId");
    const id = idInput.value.trim();
    if (!id || id === currentUser.id) return alert("ID inválido");
    if (contacts.find(c => c.id === id)) return alert("Já adicionado");

    const res = await fetch(`/getUser/${id}`);
    const user = await res.json();
    if(user.error) return alert("Usuário não encontrado");

    contacts.push(user);
    localStorage.setItem("contacts", JSON.stringify(contacts));
    renderContacts();
    idInput.value = "";
    alert("Adicionado!");
};

function renderContacts() {
    const div = document.getElementById("contacts");
    div.innerHTML = "";
    contacts.forEach(user => {
        const isOnline = listaOnlineGlobal.includes(user.id);
        const contactEl = document.createElement("div");
        contactEl.className = `contact ${contatoSelecionadoId === user.id ? 'selected' : ''}`;
        contactEl.innerHTML = `
            <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" style="width:40px;height:40px;border-radius:50%;margin-right:10px;object-fit:cover;">
            <div style="flex:1;">
                <div style="font-weight:bold;">${user.username}</div>
                <div style="font-size:11px; color:${isOnline ? '#25D366' : 'gray'}">${isOnline ? '● Online' : '● Offline'}</div>
            </div>
        `;
        let pressTimer;
        contactEl.ontouchstart = () => pressTimer = setTimeout(() => ativarSelecao(user.id), 800);
        contactEl.ontouchend = () => clearTimeout(pressTimer);
        contactEl.onclick = () => { if (contatoSelecionadoId) cancelarSelecao(); else abrirChat(user); };
        div.appendChild(contactEl);
    });
}

// --- MANTENDO SUAS FUNÇÕES DE MENSAGENS E MOMENTOS ---
async function loadMessages() {
    if (!currentChat) return;
    const res = await fetch(`/getMessages/${currentUser.id}`);
    const msgs = await res.json();
    const container = document.getElementById("messages");
    const filtered = msgs.filter(m => (m.fromId == currentUser.id && m.toId == currentChat.id) || (m.fromId == currentChat.id && m.toId == currentUser.id));
    if (container.childElementCount !== filtered.length) {
        container.innerHTML = "";
        filtered.forEach(addMessage);
        container.scrollTop = container.scrollHeight;
    }
}

function addMessage(m) {
    const container = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
    let conteudo = m.text.startsWith("data:image") ? `<img src="${m.text}" onclick="abrirFullScreen('${m.text}')">` : m.text;
    const date = new Date(m.timestamp);
    div.innerHTML = `<div class="bubble">${conteudo}<span class="time">${date.getHours()}:${date.getMinutes()}</span></div>`;
    container.appendChild(div);
}

document.getElementById("sendMessageBtn").onclick = async () => {
    const input = document.getElementById("messageText");
    if ((!input.value.trim() && !fotoParaEnviar) || !currentChat) return;
    await fetch("/sendMessage", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ fromId: currentUser.id, toId: currentChat.id, text: fotoParaEnviar || input.value })
    });
    input.value = ""; fotoParaEnviar = null;
    document.getElementById("photoPreviewContainer").style.display = "none";
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

function voltar() { document.getElementById("chatScreen").style.display = "none"; document.getElementById("home").style.display = "block"; currentChat = null; renderContacts(); }

socket.on("updateStatus", (listaOnline) => {
    listaOnlineGlobal = listaOnline;
    renderContacts();
    if (currentChat) document.getElementById("typingStatus").textContent = listaOnlineGlobal.includes(currentChat.id) ? "Online" : "offline";
});

// Funções de Seleção e Exclusão
function ativarSelecao(id) { contatoSelecionadoId = id; document.getElementById("headerSelecao").style.display = "flex"; renderContacts(); }
function cancelarSelecao() { contatoSelecionadoId = null; document.getElementById("headerSelecao").style.display = "none"; renderContacts(); }
function confirmarExclusao() { contacts = contacts.filter(c => c.id !== contatoSelecionadoId); localStorage.setItem("contacts", JSON.stringify(contacts)); cancelarSelecao(); }

// Momentos (Simplificado para o seu script)
async function loadMomentos() {
    const res = await fetch("/getMomentos");
    const todos = await res.json();
    const container = document.getElementById("listaMomentos");
    container.innerHTML = "";
    const grupos = {};
    todos.forEach(m => {
        if (m.userId === currentUser.id || contacts.find(c => c.id === m.userId)) {
            if (!grupos[m.userId]) grupos[m.userId] = { username: m.userId === currentUser.id ? "Você" : m.username, userPhoto: m.userPhoto, midias: [] };
            grupos[m.userId].midias.unshift(m.media);
        }
    });
    Object.keys(grupos).forEach(uId => {
        const g = grupos[uId];
        container.innerHTML += `<div class="momento-item" onclick="abrirVisualizadorSequencial(${JSON.stringify(g.midias).replace(/"/g, '&quot;')})"><div class="momento-aro"><img src="${g.userPhoto || ''}" class="momento-img"></div><div style="font-size:10px">${g.username}</div></div>`;
    });
            }
            
