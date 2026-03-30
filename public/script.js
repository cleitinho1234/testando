let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;
let listaOnlineGlobal = [];

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

    renderContacts();
    setInterval(loadMessages, 1500);
});

// ESCUTA ATUALIZAÇÃO DE PERFIL DOS OUTROS
socket.on("userUpdated", (dados) => {
    const index = contacts.findIndex(c => c.id == dados.id);
    if (index !== -1) {
        contacts[index].username = dados.username;
        contacts[index].photo = dados.photo;
        localStorage.setItem("contacts", JSON.stringify(contacts));
        renderContacts();
    }
});

socket.on("updateStatus", (listaOnline) => {
    listaOnlineGlobal = listaOnline;
    renderContacts();
    if (currentChat) {
        const estaOnline = listaOnline.includes(currentChat.id);
        const st = document.getElementById("typingStatus");
        st.textContent = estaOnline ? "Online" : "offline";
        st.style.color = estaOnline ? "#25D366" : "#dcdcdc";
    }
});

// --- FUNÇÕES DE SELEÇÃO E EXCLUSÃO ---

function renderContacts() {
    const div = document.getElementById("contacts");
    div.innerHTML = "";
    contacts.forEach(user => {
        const isOnline = listaOnlineGlobal.includes(user.id);
        const count = unreadCounts[user.id] || 0;
        constisSelected = contatoSelecionadoId === user.id;

        const el = document.createElement("div");
        el.className = `contact ${isSelected ? 'selected' : ''}`;
        el.innerHTML = `
            <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" style="width:45px;height:45px;border-radius:50%;margin-right:12px;object-fit:cover;">
            <div style="flex:1;">
                <div style="font-weight:bold;">${user.username}</div>
                <div style="font-size:11px; color:${isOnline ? '#25D366' : 'gray'}">${isOnline ? '● Online' : '● Offline'}</div>
            </div>
            ${count > 0 ? `<span style="background:#25D366;color:white;border-radius:50%;padding:2px 8px;font-size:12px;">${count}</span>` : ""}
        `;

        // Lógica de segurar (clique longo)
        let pressTimer;
        const start = () => pressTimer = setTimeout(() => selecionar(user.id), 700);
        const cancel = () => clearTimeout(pressTimer);

        el.onmousedown = start;
        el.onmouseup = cancel;
        el.ontouchstart = start;
        el.ontouchend = cancel;

        el.onclick = () => {
            if (contatoSelecionadoId) {
                contatoSelecionadoId = (contatoSelecionadoId === user.id) ? null : user.id;
                if (!contatoSelecionadoId) cancelarSelecao();
                else renderContacts();
            } else {
                abrirChat(user);
            }
        };
        div.appendChild(el);
    });
}

function selecionar(id) {
    contatoSelecionadoId = id;
    document.getElementById("headerSelecao").style.display = "flex";
    renderContacts();
}

function cancelarSelecao() {
    contatoSelecionadoId = null;
    document.getElementById("headerSelecao").style.display = "none";
    renderContacts();
}

function abrirConfirmacao() { document.getElementById("confirmModal").style.display = "flex"; }
function fecharModal() { document.getElementById("confirmModal").style.display = "none"; }

function confirmarExclusao() {
    contacts = contacts.filter(c => c.id !== contatoSelecionadoId);
    localStorage.setItem("contacts", JSON.stringify(contacts));
    fecharModal();
    cancelarSelecao();
}

// --- RESTANTE DAS FUNÇÕES ---

async function loadMessages() {
    const res = await fetch(`/getMessages/${currentUser.id}`);
    const msgs = await res.json();
    for (let m of msgs) {
        if (m.timestamp > lastTimestamp) {
            lastTimestamp = m.timestamp;
            if (m.toId == currentUser.id) {
                const jaTem = contacts.some(c => c.id == m.fromId);
                if (!jaTem) {
                    const r = await fetch(`/getUser/${m.fromId}`);
                    const u = await r.json();
                    if(!u.error) contacts.unshift(u);
                }
                if (currentChat?.id !== m.fromId) {
                    unreadCounts[m.fromId] = (unreadCounts[m.fromId] || 0) + 1;
                }
            }
        }
    }
    localStorage.setItem("lastTimestamp", lastTimestamp);
    localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
    localStorage.setItem("contacts", JSON.stringify(contacts));
    renderContacts();

    if (currentChat) {
        const filtered = msgs.filter(m => (m.fromId == currentUser.id && m.toId == currentChat.id) || (m.fromId == currentChat.id && m.toId == currentUser.id));
        const container = document.getElementById("messages");
        container.innerHTML = "";
        filtered.forEach(m => {
            const d = document.createElement("div");
            d.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
            d.textContent = m.text;
            container.appendChild(d);
        });
        container.scrollTop = container.scrollHeight;
    }
}

function abrirChat(user) {
    currentChat = user;
    unreadCounts[user.id] = 0;
    document.getElementById("home").style.display = "none";
    document.getElementById("chatScreen").style.display = "flex";
    document.getElementById("chatName").textContent = user.username;
    document.getElementById("chatAvatar").src = user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
}

function voltar() {
    document.getElementById("chatScreen").style.display = "none";
    document.getElementById("home").style.display = "block";
    currentChat = null;
}

document.getElementById("sendMessageBtn").onclick = async () => {
    const input = document.getElementById("messageText");
    const text = input.value.trim();
    if(!text || !currentChat) return;
    input.value = "";
    await fetch("/sendMessage", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ fromId: currentUser.id, toId: currentChat.id, text })
    });
    loadMessages();
};

document.getElementById("addFriendBtn").onclick = async () => {
    const id = document.getElementById("addUserId").value.trim();
    if(!id || id == currentUser.id) return;
    const res = await fetch(`/getUser/${id}`);
    const user = await res.json();
    if(user.error) return alert("Usuário não encontrado");
    if(!contacts.some(c => c.id == id)) contacts.unshift(user);
    localStorage.setItem("contacts", JSON.stringify(contacts));
    renderContacts();
};

// Salvar Perfil
document.getElementById("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const nome = document.getElementById("username").value;
    const file = document.getElementById("profilePic").files[0];
    let foto = currentUser.photo;

    const salvar = async (f) => {
        await fetch("/saveProfile", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ id: currentUser.id, username: nome, photo: f })
        });
        currentUser.username = nome;
        currentUser.photo = f;
        socket.emit("updateProfileVisual", { id: currentUser.id, username: nome, photo: f });
        alert("Salvo!");
    };

    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => salvar(ev.target.result);
        reader.readAsDataURL(file);
    } else salvar(foto);
};
        
