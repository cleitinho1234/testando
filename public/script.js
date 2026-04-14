let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let listaOnlineGlobal = [];
let receiveTypingTimeout;

// --- LÓGICA DE VÍDEOS (SHORTS) ---
let player;

// Carregado pela API do YouTube
function onYouTubeIframeAPIReady() {
    console.log("YouTube Player API Pronta");
}

function abrirPlayer() {
    document.getElementById("videoPlayerModal").style.display = "flex";
    
    // Lista de termos para busca automática
    const termos = ["shorts engraçados", "satisfying shorts", "curiosidades", "games shorts"];
    const buscaAleatoria = termos[Math.floor(Math.random() * termos.length)];

    if (player) {
        player.destroy(); // Limpa o player antigo para não dar erro
    }

    player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        playerVars: {
            'listType': 'search',
            'list': buscaAleatoria,
            'autoplay': 1,
            'controls': 0,
            'modestbranding': 1,
            'rel': 0,
            'showinfo': 0,
            'iv_load_policy': 3
        },
        events: {
            'onReady': (event) => event.target.playVideo(),
            'onError': () => proximoVideo()
        }
    });
}

function proximoVideo() {
    if (player && player.nextVideo) {
        player.nextVideo();
    } else {
        abrirPlayer(); // Reinicia busca se travar
    }
}

function fecharPlayer() {
    if (player) player.stopVideo();
    document.getElementById("videoPlayerModal").style.display = "none";
}

// --- PERSISTÊNCIA E INICIALIZAÇÃO ---
function gerarDeviceID() {
    const info = [navigator.userAgent, navigator.language, screen.colorDepth, screen.width + 'x' + screen.height].join('###');
    let hash = 0;
    for (let i = 0; i < info.length; i++) {
        let char = info.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return "DEV-" + Math.abs(hash);
}

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
            }
        } catch (e) { console.log("Sem conta para recuperar."); }
    }

    if (!currentUser) {
        const res = await fetch("/api/user", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ username: "Novo Usuário", photo: "", deviceId: deviceID })
        });
        currentUser = await res.json();
    }

    localStorage.setItem("userId", currentUser.id);
    localStorage.setItem("myUserObject", JSON.stringify(currentUser));

    socket.emit("register", currentUser.id);
    document.getElementById("username").value = currentUser.username || "";
    document.getElementById("userIdDisplay").textContent = currentUser.id;
    
    if(currentUser.photo) document.getElementById("profilePreview").src = currentUser.photo;

    renderContacts();
    setInterval(loadMessages, 1500);
});

// --- STATUS E DIGITAÇÃO ---
socket.on("updateStatus", (listaOnline) => {
    listaOnlineGlobal = listaOnline;
    renderContacts(); 
    if (currentChat) atualizarStatusChatInterno(currentChat.id);
});

socket.on("userTyping", (data) => {
    if (currentChat && currentChat.id === data.fromId) {
        const statusElement = document.getElementById("chatStatus");
        statusElement.textContent = "Digitando...";
        statusElement.style.color = "#25D366";
        clearTimeout(receiveTypingTimeout);
        receiveTypingTimeout = setTimeout(() => atualizarStatusChatInterno(data.fromId), 2000);
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

// --- PERFIL ---
document.getElementById("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const nome = document.getElementById("username").value.trim();
    const foto = document.getElementById("profilePreview").src;
    
    await fetch("/api/saveProfile", {
        method: "POST", 
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ id: currentUser.id, username: nome, photo: foto })
    });
    
    currentUser.username = nome;
    currentUser.photo = foto;
    localStorage.setItem("myUserObject", JSON.stringify(currentUser));
    socket.emit("updateProfile", { id: currentUser.id, username: nome, photo: foto });
    alert("Perfil salvo!");
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
    if (user.error) return alert("Usuário não encontrado!");

    if (!contacts.find(c => c.id === user.id)) {
        contacts.push(user);
        localStorage.setItem("contacts", JSON.stringify(contacts));
        renderContacts();
    }
    document.getElementById("addUserId").value = "";
};
