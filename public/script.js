let currentUser = null;
let currentChat = null;
let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;

window.addEventListener("load", async () => {
    let savedId = localStorage.getItem("userId");

    // 1. Tentar recuperar usuário
    if (savedId) {
        try {
            const res = await fetch(`/getUser/${savedId}`);
            if (res.ok) currentUser = await res.json();
        } catch (e) { console.log("Servidor offline, tentando reconectar..."); }
    }

    // 2. Se falhou ou não existe, criar novo
    if (!currentUser) {
        try {
            const res = await fetch("/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: "Novo Usuário", photo: "" })
            });
            currentUser = await res.json();
            localStorage.setItem("userId", currentUser.id);
        } catch (e) {
            document.getElementById("userIdDisplay").textContent = "Erro de conexão";
            return;
        }
    }

    // 3. Atualizar UI
    document.getElementById("username").value = currentUser.username || "";
    document.getElementById("userIdDisplay").textContent = currentUser.id;
    if (currentUser.photo) document.getElementById("profilePreview").src = currentUser.photo;

    // 4. Loops de Sincronização
    setInterval(() => { loadMessages(); enviarSinalOnline(); }, 2000);
    setInterval(async () => { await atualizarContatos(); renderContacts(); }, 6000);

    renderContacts();
});

async function enviarSinalOnline() {
    if (currentUser?.id) {
        fetch("/updatePresence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: currentUser.id })
        });
    }
}

document.getElementById("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById("username").value;
    const file = document.getElementById("profilePic").files[0];
    let photo = currentUser.photo;

    if (file) {
        const reader = new FileReader();
        reader.onload = async () => {
            photo = reader.result;
            document.getElementById("profilePreview").src = photo;
            await salvarFinal(name, photo);
        };
        reader.readAsDataURL(file);
    } else { await salvarFinal(name, photo); }
};

async function salvarFinal(username, photo) {
    currentUser.username = username;
    currentUser.photo = photo;
    await fetch("/saveProfile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentUser.id, username, photo })
    });
}

async function atualizarContatos() {
    for (let i = 0; i < contacts.length; i++) {
        try {
            const res = await fetch(`/getUser/${contacts[i].id}`);
            if (res.ok) contacts[i] = await res.json();
        } catch (e) {}
    }
    localStorage.setItem("contacts", JSON.stringify(contacts));
}

function renderContacts() {
    const container = document.getElementById("contacts");
    container.innerHTML = "";
    contacts.forEach(user => {
        const isOnline = user.lastSeen && (Date.now() - user.lastSeen < 40000);
        const div = document.createElement("div");
        div.className = "contact";
        div.onclick = () => abrirChat(user);
        div.innerHTML = `
            <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" style="width:40px;height:40px;border-radius:50%;margin-right:10px;border:2px solid ${isOnline?'#2ecc71':'#ccc'}">
            <div style="flex:1"><strong>${user.username}</strong><br><small>${isOnline?'online':'offline'}</small></div>
            ${unreadCounts[user.id] ? `<span style="background:red;color:white;padding:2px 7px;border-radius:50%;font-size:10px">${unreadCounts[user.id]}</span>`:''}
        `;
        container.appendChild(div);
    });
}

function abrirChat(user) {
    currentChat = user;
    unreadCounts[user.id] = 0;
    document.getElementById("home").style.display = "none";
    document.getElementById("chatScreen").style.display = "flex";
    document.getElementById("chatName").textContent = user.username;
    document.getElementById("chatAvatar").src = user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    loadMessages(true);
}

document.getElementById("sendMessageBtn").onclick = async () => {
    const input = document.getElementById("messageText");
    if (!input.value.trim() || !currentChat) return;
    const msg = { fromId: currentUser.id, toId: currentChat.id, text: input.value };
    input.value = "";
    addMessage({ ...msg, timestamp: Date.now() });
    await fetch("/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg)
    });
};

async function loadMessages(forceScroll = false) {
    try {
        const res = await fetch(`/getMessages/${currentUser.id}`);
        const msgs = await res.json();
        let hasNew = false;
        msgs.forEach(m => {
            if (m.timestamp > lastTimestamp) { lastTimestamp = m.timestamp; hasNew = true; 
                if (m.toId == currentUser.id && currentChat?.id != m.fromId) unreadCounts[m.fromId] = (unreadCounts[m.fromId]||0)+1;
            }
        });
        if (hasNew || forceScroll) {
            if (currentChat) {
                const container = document.getElementById("messages");
                container.innerHTML = "";
                msgs.filter(m => (m.fromId==currentUser.id && m.toId==currentChat.id)||(m.fromId==currentChat.id && m.toId==currentUser.id))
                    .forEach(addMessage);
                container.scrollTop = container.scrollHeight;
            }
        }
    } catch (e) {}
}

function addMessage(m) {
    const container = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = `message ${m.fromId == currentUser.id ? 'me' : 'other'}`;
    const time = new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    div.innerHTML = `<div class="bubble">${m.text}<br><small style="font-size:9px;opacity:0.5">${time}</small></div>`;
    container.appendChild(div);
}

function voltar() {
    document.getElementById("chatScreen").style.display = "none";
    document.getElementById("home").style.display = "block";
    currentChat = null;
}

// Adicionar amigo
document.getElementById("addFriendBtn").onclick = async () => {
    const id = document.getElementById("addUserId").value.trim();
    if (!id || id == currentUser.id) return;
    const res = await fetch(`/getUser/${id}`);
    const user = await res.json();
    if (user.error) return alert("Usuário não existe");
    if (!contacts.find(c => c.id == id)) contacts.unshift(user);
    renderContacts();
};
