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

// --- FUNÇÃO DE PERSISTÊNCIA (DEVICE ID) ---
function gerarDeviceID() {
    const info = [
        navigator.userAgent, navigator.language, screen.colorDepth,
        screen.width + 'x' + screen.height, navigator.hardwareConcurrency
    ].join('###');
    
    let hash = 0;
    for (let i = 0; i < info.length; i++) {
        let char = info.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return "DEV-" + Math.abs(hash);
}

// --- LÓGICA DE INSTALAÇÃO (PWA) ---
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btnInstalar = document.getElementById('btnInstalarPWA');
    if (btnInstalar) btnInstalar.style.display = 'block';
});

async function instalarMiniZap() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        const btnInstalar = document.getElementById('btnInstalarPWA');
        if (btnInstalar) btnInstalar.style.display = 'none';
    }
    deferredPrompt = null;
}

// --- INICIALIZAÇÃO ---
window.addEventListener("load", async () => {
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
        if(document.getElementById("myMomentPhoto")) document.getElementById("myMomentPhoto").src = currentUser.photo;
    }

    renderContacts();
    loadMoments(); 
    setInterval(loadMessages, 1500);
});

// --- STATUS ONLINE E DIGITANDO EM TEMPO REAL ---
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

// --- MENSAGENS E CONTATOS ---
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
    loadMessages();
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

function voltar() {
    document.getElementById("chatScreen").style.display = "none";
    document.getElementById("home").style.display = "flex";
    currentChat = null;
    renderContacts();
}

// 🔥 LÓGICA RÁPIDA PARA ADICIONAR AMIGO
document.getElementById("addFriendBtn").onclick = async () => {
    const input = document.getElementById("addUserId");
    const idParaAdicionar = input.value.trim();

    if (!idParaAdicionar) return alert("Digite um ID!");
    if (idParaAdicionar === currentUser.id) return alert("Você não pode adicionar você mesmo!");
    
    // Verifica se já existe para evitar lentidão com duplicatas
    if (contacts.some(c => c.id === idParaAdicionar)) {
        return alert("Contato já está na lista!");
    }

    try {
        const res = await fetch(`/api/user/${idParaAdicionar}`);
        const novoContato = await res.json();

        if (novoContato.error) {
            alert("ID não encontrado!");
        } else {
            contacts.unshift({ id: novoContato.id, username: novoContato.username, photo: novoContato.photo });
            localStorage.setItem("contacts", JSON.stringify(contacts));
            renderContacts();
            input.value = "";
            alert(`${novoContato.username} adicionado!`);
        }
    } catch (e) { alert("Erro ao buscar ID."); }
};

document.getElementById("messageText").oninput = () => {
    if (!currentChat || !currentUser) return;
    socket.emit("typing", { toId: currentChat.id, fromId: currentUser.id });
};

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

// --- MOMENTOS E PERFIL ---
async function loadMoments() {
    try {
        const res = await fetch("/api/moments");
        const todosMomentos = await res.json();
        const momentosFiltrados = todosMomentos.filter(m => contacts.some(c => c.id === m.userId) || m.userId === currentUser.id);
        const container = document.getElementById("momentsList");
        if(!container) return;
        container.innerHTML = "";
        const grupos = {};
        momentosFiltrados.forEach(m => { if (!grupos[m.userId]) grupos[m.userId] = []; grupos[m.userId].push(m); });
        Object.values(grupos).forEach(msgs => {
            const m = msgs[0];
            const div = document.createElement("div");
            div.className = "momento-item";
            div.innerHTML = `
                <div class="momento-aro"><img src="${m.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="momento-img"></div>
                <div style="font-size: 11px; margin-top: 5px; color: #555;">${m.username.split(' ')[0]}</div>
            `;
            div.onclick = () => abrirPlayerStatus(msgs);
            container.appendChild(div);
        });
    } catch (e) { console.error("Erro ao carregar momentos", e); }
}

function fecharStatus() { document.getElementById("fullScreenViewer").style.display = "none"; clearTimeout(statusInterval); }

document.getElementById("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const nome = document.getElementById("username").value.trim();
    const previewAtual = document.getElementById("profilePreview").src;
    const res = await fetch("/api/saveProfile", {
        method: "POST", 
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ id: currentUser.id, username: nome, photo: previewAtual })
    });
    if (res.ok) {
        currentUser.username = nome; currentUser.photo = previewAtual;
        localStorage.setItem("myUserObject", JSON.stringify(currentUser));
        socket.emit("updateProfileVisual", { id: currentUser.id, username: nome, photo: previewAtual });
        alert("Perfil Atualizado!");
    }
};

document.getElementById("profilePic").onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById("profilePreview").src = ev.target.result;
            if(document.getElementById("myMomentPhoto")) document.getElementById("myMomentPhoto").src = ev.target.result;
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
    }
});

socket.on("receiveMessage", (data) => {
    const { msg, sender } = data;
    if (!contacts.some(c => c.id === sender.id)) { contacts.unshift(sender); localStorage.setItem("contacts", JSON.stringify(contacts)); }
    if (!currentChat || currentChat.id !== sender.id) {
        unreadCounts[sender.id] = (unreadCounts[sender.id] || 0) + 1;
        localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
    }
    renderContacts();
    if (currentChat && currentChat.id === sender.id) loadMessages();
});
