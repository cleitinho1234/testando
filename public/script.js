let currentUser = null;
let currentChat = null;

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;

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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "Novo Usuário", photo: "" })
        });
        currentUser = await res.json();
        localStorage.setItem("userId", currentUser.id);
    }

    document.getElementById("username").value = currentUser.username || "";
    document.getElementById("userIdDisplay").textContent = currentUser.id;
    if (currentUser.photo) document.getElementById("profilePreview").src = currentUser.photo;

    // ADD CONTATO
    document.getElementById("addFriendBtn").onclick = async () => {
        const id = document.getElementById("addUserId").value.trim();
        if (!id || id == currentUser.id) return;
        const res = await fetch(`/getUser/${id}`);
        const user = await res.json();
        if (user.error) return alert("ID não encontrado");
        contacts.unshift(user);
        localStorage.setItem("contacts", JSON.stringify(contacts));
        renderContacts();
    };

    renderContacts();

    // LOOP PRINCIPAL
    setInterval(() => {
        loadMessages();
        enviarSinalOnline(); 
        atualizarContatos().then(() => {
            renderContacts();
            atualizarStatusHeader();
        });
    }, 1500);
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

// PERFIL (FOTO E NOME)
document.getElementById("profileForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("username").value;
    const file = document.getElementById("profilePic").files[0];

    if (file) {
        const reader = new FileReader();
        reader.onload = async () => {
            const photo = reader.result;
            document.getElementById("profilePreview").src = photo;
            await salvarPerfil(username, photo);
        };
        reader.readAsDataURL(file);
    } else {
        await salvarPerfil(username, currentUser.photo);
    }
});

async function salvarPerfil(username, photo) {
    currentUser.username = username;
    currentUser.photo = photo;

    const res = await fetch("/saveProfile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentUser.id, username, photo })
    });

    if (res.ok) alert("Perfil atualizado!");
    else alert("Erro: Foto muito pesada.");
}

async function atualizarContatos() {
    for (let i = 0; i < contacts.length; i++) {
        const res = await fetch(`/getUser/${contacts[i].id}`);
        const user = await res.json();
        if (!user.error) contacts[i] = user;
    }
    localStorage.setItem("contacts", JSON.stringify(contacts));
}

function renderContacts() {
    const div = document.getElementById("contacts");
    let html = "";
    for (let user of contacts) {
        const isOnline = user.lastSeen && (Date.now() - user.lastSeen < 30000);
        html += `
            <div class="contact" onclick="abrirChat('${user.id}')" style="display:flex;align-items:center;padding:10px;cursor:pointer;">
                <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" 
                     style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid ${isOnline ? '#2ecc71' : '#ccc'}">
                <div style="margin-left:10px">
                    <div style="font-weight:bold">${user.username}</div>
                    <div style="font-size:10px;color:${isOnline ? '#2ecc71' : 'gray'}">${isOnline ? 'online' : 'offline'}</div>
                </div>
            </div>`;
    }
    div.innerHTML = html;
}

function atualizarStatusHeader() {
    if (!currentChat) return;
    const user = contacts.find(c => c.id === currentChat.id);
    if (!user) return;

    const isOnline = user.lastSeen && (Date.now() - user.lastSeen < 30000);
    let statusText = "offline";
    
    if (isOnline) {
        statusText = `<span style="color:#2ecc71;font-weight:bold">online</span>`;
    } else if (user.lastSeen) {
        const d = new Date(user.lastSeen);
        statusText = `visto hoje às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    document.getElementById("chatName").innerHTML = `
        <div style="text-align:center">
            <div style="font-weight:bold">${user.username}</div>
            <div style="font-size:11px;color:#666">${statusText}</div>
        </div>`;
}

function abrirChat(id) {
    currentChat = contacts.find(c => c.id == id);
    document.getElementById("home").style.display = "none";
    document.getElementById("chatScreen").style.display = "flex";
    atualizarStatusHeader();
    loadMessages();
}

function voltar() {
    document.getElementById("chatScreen").style.display = "none";
    document.getElementById("home").style.display = "block";
    currentChat = null;
}

document.getElementById("sendMessageBtn").onclick = () => {
    const input = document.getElementById("messageText");
    const text = input.value.trim();
    if (!text || !currentChat) return;
    const msg = { fromId: currentUser.id, toId: currentChat.id, text };
    fetch("/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg)
    });
    input.value = "";
    addMessage({...msg, timestamp: Date.now()});
};

async function loadMessages() {
    if (!currentChat) return;
    const res = await fetch(`/getMessages/${currentUser.id}`);
    const msgs = await res.json();
    const filtered = msgs.filter(m => (m.fromId == currentUser.id && m.toId == currentChat.id) || (m.fromId == currentChat.id && m.toId == currentUser.id));
    const container = document.getElementById("messages");
    container.innerHTML = "";
    filtered.forEach(addMessage);
    container.scrollTop = container.scrollHeight;
}

function addMessage(m) {
    const container = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
    const d = new Date(m.timestamp);
    div.innerHTML = `<div class="bubble">${m.text}<div style="font-size:9px;opacity:0.5;text-align:right">${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}</div></div>`;
    container.appendChild(div);
}
