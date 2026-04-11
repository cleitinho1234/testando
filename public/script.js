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

// --- 🔥 FUNÇÃO ADD (VOLTOU A FUNCIONAR) ---
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

// --- 📸 STATUS / MOMENTOS (RECUPERADOS) ---
async function loadMomentos() {
    try {
        const res = await fetch("/getMomentos");
        const todos = await res.json();
        const container = document.getElementById("listaMomentos");
        container.innerHTML = "";
        const grupos = {};
        const idsContatos = contacts.map(c => c.id);

        todos.forEach(m => {
            if (m.userId === currentUser.id || idsContatos.includes(m.userId)) {
                if (!grupos[m.userId]) {
                    grupos[m.userId] = { 
                        username: m.userId === currentUser.id ? "Você" : m.username, 
                        userPhoto: m.userPhoto, 
                        midias: [] 
                    };
                }
                grupos[m.userId].midias.unshift(m.media);
            }
        });

        Object.keys(grupos).forEach(userId => {
            const g = grupos[userId];
            const item = document.createElement("div");
            item.className = "momento-item";
            item.onclick = () => abrirVisualizadorSequencial(g.midias);
            item.innerHTML = `
                <div class="momento-aro" style="border-color: ${userId === currentUser.id ? '#075e54' : '#25D366'}">
                    <img src="${g.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="momento-img">
                </div>
                <div style="font-size: 11px; margin-top: 5px; color: #555;">${g.username}</div>
            `;
            container.appendChild(item);
        });
    } catch (e) { console.error(e); }
}

function abrirVisualizadorSequencial(listaFotos) {
    let indice = 0;
    const viewer = document.getElementById("fullScreenViewer");
    const img = document.getElementById("fullScreenImage");
    const mostrar = () => {
        clearTimeout(tempoStatus);
        if (indice >= listaFotos.length) return fecharFullScreen();
        img.src = listaFotos[indice];
        viewer.style.display = "flex";
        tempoStatus = setTimeout(() => { indice++; mostrar(); }, 4000);
    };
    mostrar();
    img.onclick = (e) => { e.stopPropagation(); indice++; mostrar(); };
}

async function postarNovoMomento(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        await fetch("/postarMomento", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
                userId: currentUser.id, username: currentUser.username,
                userPhoto: currentUser.photo, media: e.target.result
            })
        });
        input.value = ""; loadMomentos();
    };
    reader.readAsDataURL(file);
}

// --- 🗑️ EXCLUIR E RENDERIZAR CONTATOS ---
function renderContacts() {
    const div = document.getElementById("contacts");
    div.innerHTML = "";
    contacts.forEach(user => {
        const isOnline = listaOnlineGlobal.includes(user.id);
        const isSelected = contatoSelecionadoId === user.id;
        const contactEl = document.createElement("div");
        contactEl.className = `contact ${isSelected ? 'selected' : ''}`;
        if (isSelected) contactEl.style.backgroundColor = "rgba(7, 94, 84, 0.1)";

        contactEl.innerHTML = `
            <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" style="width:40px;height:40px;border-radius:50%;margin-right:10px;object-fit:cover;">
            <div style="flex:1;">
                <div style="font-weight:bold;">${user.username}</div>
                <div style="font-size:11px; color:${isOnline ? '#25D366' : 'gray'}">${isOnline ? '● Online' : '● Offline'}</div>
            </div>
            ${isSelected ? '<span style="color:#075e54; font-weight:bold; margin-right:10px;">✓</span>' : ''}
        `;

        let pressTimer;
        contactEl.ontouchstart = () => pressTimer = setTimeout(() => ativarSelecao(user.id), 800);
        contactEl.ontouchend = () => clearTimeout(pressTimer);
        contactEl.onclick = () => { if (contatoSelecionadoId) cancelarSelecao(); else abrirChat(user); };
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

function confirmarExclusao() {
    contacts = contacts.filter(c => c.id !== contatoSelecionadoId);
    localStorage.setItem("contacts", JSON.stringify(contacts));
    cancelarSelecao();
}

// --- 💬 MENSAGENS E CHAT ---
async function loadMessages() {
    if (!currentChat) return;
    const res = await fetch(`/getMessages/${currentUser.id}`);
    const msgs = await res.json();
    const container = document.getElementById("messages");
    const filtered = msgs.filter(m => (m.fromId == currentUser.id && m.toId == currentChat.id) || (m.fromId == currentChat.id && m.toId == currentUser.id));
    
    if (container.childElementCount !== filtered.length) {
        container.innerHTML = "";
        filtered.forEach(m => {
            const div = document.createElement("div");
            div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
            let conteudo = m.text.startsWith("data:image") ? `<img src="${m.text}" onclick="abrirFullScreen('${m.text}')" style="max-width:200px; border-radius:10px;">` : m.text;
            div.innerHTML = `<div class="bubble">${conteudo}</div>`;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    }
}

document.getElementById("sendMessageBtn").onclick = async () => {
    const input = document.getElementById("messageText");
    if ((!input.value.trim() && !fotoParaEnviar) || !currentChat) return;
    await fetch("/sendMessage", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ fromId: currentUser.id, toId: currentChat.id, text: fotoParaEnviar || input.value })
    });
    input.value = ""; fotoParaEnviar = null; loadMessages();
};

function abrirChat(user) {
    currentChat = user;
    document.getElementById("home").style.display = "none";
    document.getElementById("chatScreen").style.display = "flex";
    document.getElementById("chatName").textContent = user.username;
    loadMessages();
}

function voltar() { document.getElementById("chatScreen").style.display = "none"; document.getElementById("home").style.display = "block"; currentChat = null; }
function fecharFullScreen() { clearTimeout(tempoStatus); document.getElementById("fullScreenViewer").style.display = "none"; }

socket.on("updateStatus", (lista) => { listaOnlineGlobal = lista; renderContacts(); });
