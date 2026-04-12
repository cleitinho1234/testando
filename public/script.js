let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let listaOnlineGlobal = [];
let statusInterval; // Para controlar o tempo do status

window.addEventListener("load", async () => {
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
    loadMoments(); // Carrega os status ao abrir
    setInterval(loadMessages, 1500);
});

// --- LÓGICA DE MOMENTOS (STATUS) ---

async function loadMoments() {
    const res = await fetch("/api/moments");
    const todosMomentos = await res.json();
    
    // FILTRO DE PRIVACIDADE: Só vejo momentos de quem eu tenho o ID salvo (contatos) ou os meus
    const momentosFiltrados = todosMomentos.filter(m => 
        contacts.some(c => c.id === m.userId) || m.userId === currentUser.id
    );

    const container = document.getElementById("momentsList");
    if(!container) return;

    // Mantém o botão de adicionar
    const addBtn = container.querySelector(".add-moment");
    container.innerHTML = "";
    container.appendChild(addBtn);

    // Agrupar momentos por usuário para o player funcionar corretamente
    const grupos = {};
    momentosFiltrados.forEach(m => {
        if (!grupos[m.userId]) grupos[m.userId] = [];
        grupos[m.userId].push(m);
    });

    Object.values(grupos).forEach(msgs => {
        const m = msgs[0];
        const div = document.createElement("div");
        div.className = "moment-item";
        div.innerHTML = `
            <div class="moment-ring">
                <img src="${m.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="moment-img">
            </div>
            <span>${m.username.split(' ')[0]}</span>
        `;
        div.onclick = () => abrirPlayerStatus(msgs);
        container.appendChild(div);
    });
}

function abrirPlayerStatus(lista) {
    let index = 0;
    const modal = document.getElementById("statusView");
    const progress = document.getElementById("statusProgress");
    const img = document.getElementById("statusImg");

    modal.style.display = "flex";

    const play = (idx) => {
        if (idx >= lista.length) return fecharStatus();
        index = idx;
        img.src = lista[idx].media;

        // Reset animação da barra
        progress.style.transition = "none";
        progress.style.width = "0%";
        
        setTimeout(() => {
            progress.style.transition = "width 5s linear";
            progress.style.width = "100%";
        }, 50);

        clearTimeout(statusInterval);
        statusInterval = setTimeout(() => play(index + 1), 5000);
    };

    modal.onclick = (e) => {
        if (e.clientX > window.innerWidth / 2) play(index + 1);
        else if (index > 0) play(index - 1);
    };

    play(0);
}

function fecharStatus() {
    document.getElementById("statusView").style.display = "none";
    clearTimeout(statusInterval);
}

// Postar Momento
document.getElementById("momentInput").onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
            // Aqui você pode usar a mesma lógica de compressão do perfil se desejar
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

// --- MENSAGENS E CONTATOS (MANTIDO) ---

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

socket.on("userUpdated", (dados) => {
    const index = contacts.findIndex(c => c.id == dados.id);
    if (index !== -1) {
        contacts[index].username = dados.username;
        contacts[index].photo = dados.photo;
        localStorage.setItem("contacts", JSON.stringify(contacts));
        renderContacts();
    }
    if (currentChat && currentChat.id == dados.id) {
        document.getElementById("chatName").textContent = dados.username;
        document.getElementById("chatAvatar").src = dados.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    }
});

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
        socket.emit("updateProfileVisual", { id: currentUser.id, username: nome, photo: previewAtual });
        alert("Perfil Atualizado!");
    }
};
