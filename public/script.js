let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let listaOnlineGlobal = [];
let statusInterval; 

window.addEventListener("load", async () => {
    // Segurança contra IDs corrompidos
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
        const res = await fetch("/api/user", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ username: "Novo Usuário", photo: "" })
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

// --- LÓGICA DE MOMENTOS (STATUS) ---

async function loadMoments() {
    try {
        const res = await fetch("/api/moments");
        const todosMomentos = await res.json();
        
        const momentosFiltrados = todosMomentos.filter(m => 
            contacts.some(c => c.id === m.userId) || m.userId === currentUser.id
        );

        const container = document.getElementById("momentsList");
        if(!container) return;

        container.innerHTML = "";

        const grupos = {};
        momentosFiltrados.forEach(m => {
            if (!grupos[m.userId]) grupos[m.userId] = [];
            grupos[m.userId].push(m);
        });

        Object.values(grupos).forEach(msgs => {
            const m = msgs[0];
            const div = document.createElement("div");
            div.className = "momento-item";
            div.innerHTML = `
                <div class="momento-aro">
                    <img src="${m.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="momento-img">
                </div>
                <div style="font-size: 11px; margin-top: 5px; color: #555;">${m.username.split(' ')[0]}</div>
            `;
            div.onclick = () => abrirPlayerStatus(msgs);
            container.appendChild(div);
        });
    } catch (e) { console.error("Erro ao carregar momentos", e); }
}

function abrirPlayerStatus(lista) {
    let index = 0;
    const viewer = document.getElementById("fullScreenViewer");
    const progressContainer = document.getElementById("statusProgressBar");
    const img = document.getElementById("statusImg");

    viewer.style.display = "flex";
    progressContainer.innerHTML = "";

    // Cria as barrinhas segmentadas para cada status
    lista.forEach(() => {
        const segment = document.createElement("div");
        segment.className = "status-segment";
        segment.innerHTML = '<div class="status-filler"></div>';
        progressContainer.appendChild(segment);
    });

    const play = (idx) => {
        if (idx >= lista.length) return fecharStatus();
        if (idx < 0) idx = 0;
        index = idx;

        img.src = lista[idx].media;

        // Atualiza as barrinhas (vistas, ativa, futura)
        const segments = document.querySelectorAll(".status-segment");
        segments.forEach((seg, i) => {
            seg.classList.remove("active", "seen");
            if (i < idx) {
                seg.classList.add("seen");
            } else if (i === idx) {
                // Truque para reiniciar a animação do CSS
                void seg.offsetWidth; 
                seg.classList.add("active");
            }
        });

        clearTimeout(statusInterval);
        statusInterval = setTimeout(() => play(index + 1), 5000);
    };

    img.onclick = (e) => {
        if (e.clientX > window.innerWidth / 2) play(index + 1);
        else play(index - 1);
    };

    play(0); // Começa sempre do primeiro (o mais antigo)
}

function fecharStatus() {
    document.getElementById("fullScreenViewer").style.display = "none";
    clearTimeout(statusInterval);
}

document.getElementById("momentInput").onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
            await fetch("/api/moments", {
                method: "POST",
                headers: {"Content-Type":"application/json"},
                body: JSON.stringify({
                    userId: currentUser.id,
                    username: currentUser.username,
                    userPhoto: currentUser.photo,
                    media: ev.target.result
                })
            });
            loadMoments();
        };
        reader.readAsDataURL(file);
    }
};

socket.on("newMoment", () => loadMoments());

// --- MENSAGENS E CONTATOS ---

socket.on("receiveMessage", (data) => {
    const { msg, sender } = data;
    const index = contacts.findIndex(c => c.id === sender.id);
    if (index === -1) {
        contacts.unshift(sender);
        localStorage.setItem("contacts", JSON.stringify(contacts));
    }
    if (!currentChat || currentChat.id !== sender.id) {
        unreadCounts[sender.id] = (unreadCounts[sender.id] || 0) + 1;
        localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
    }
    renderContacts();
    if (currentChat && currentChat.id === sender.id) loadMessages();
});

socket.on("updateStatus", (listaOnline) => {
    listaOnlineGlobal = listaOnline;
    renderContacts();
});

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
    document.getElementById("home").style.display = "flex";
    currentChat = null;
    renderContacts();
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

document.getElementById("addFriendBtn").onclick = async () => {
    const id = document.getElementById("addUserId").value.trim();
    if(!id || id === currentUser.id) return;
    const res = await fetch(`/api/user/${id}`);
    const user = await res.json();
    if(user.error) return alert("Usuário não encontrado!");
    
    if(!contacts.some(c => c.id === user.id)) {
        contacts.push(user);
        localStorage.setItem("contacts", JSON.stringify(contacts));
        renderContacts();
    }
    document.getElementById("addUserId").value = "";
};

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
        currentUser.username = nome; 
        currentUser.photo = previewAtual;
        localStorage.setItem("myUserObject", JSON.stringify(currentUser));
        alert("Perfil Atualizado!");
    } else {
        alert("Erro ao salvar perfil no servidor.");
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
