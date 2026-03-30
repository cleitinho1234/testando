let currentUser = null;
let currentChat = null;
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;
let listaOnlineGlobal = [];

window.addEventListener("load", async () => {
    let savedId = localStorage.getItem("userId");

    // 1. Tenta carregar o usuário do servidor para ter o nome mais atual
    if (savedId) {
        const res = await fetch(`/getUser/${savedId}`);
        const user = await res.json();
        if (!user.error && user.username) {
            currentUser = user;
        }
    }

    // 2. Se não existir, cria um novo
    if (!currentUser) {
        const res = await fetch("/user", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ username: "Novo Usuário", photo: "" })
        });
        currentUser = await res.json();
        localStorage.setItem("userId", currentUser.id);
    }

    // Registra no socket e preenche a tela
    socket.emit("register", currentUser.id);
    document.getElementById("username").value = currentUser.username || "";
    document.getElementById("userIdDisplay").textContent = currentUser.id;
    if(currentUser.photo) document.getElementById("profilePreview").src = currentUser.photo;

    renderContacts();
    setInterval(loadMessages, 1500);
});

// ==========================================
// 🔥 FUNÇÃO DE SALVAR PERFIL ATUALIZADA
// ==========================================
document.getElementById("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    
    const novoNome = document.getElementById("username").value.trim();
    const inputFoto = document.getElementById("profilePic");
    let fotoBase64 = currentUser.photo;

    if (!novoNome) return alert("Digite um nome!");

    // Se tiver arquivo de foto, converte para Base64 antes de salvar
    if (inputFoto.files && inputFoto.files[0]) {
        const reader = new FileReader();
        reader.onload = async (event) => {
            fotoBase64 = event.target.result;
            await enviarDadosPerfil(novoNome, fotoBase64);
        };
        reader.readAsDataURL(inputFoto.files[0]);
    } else {
        await enviarDadosPerfil(novoNome, fotoBase64);
    }
};

async function enviarDadosPerfil(nome, foto) {
    // Atualiza localmente
    currentUser.username = nome;
    currentUser.photo = foto;
    if(foto) document.getElementById("profilePreview").src = foto;

    // Salva no Banco de Dados via Servidor
    const res = await fetch("/saveProfile", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
            id: currentUser.id,
            username: nome,
            photo: foto
        })
    });

    const data = await res.json();
    if(data.success) {
        alert("Perfil atualizado com sucesso!");
    }
}

// ==========================================
// RESTANTE DO CÓDIGO (CONTATOS E MENSAGENS)
// ==========================================

socket.on("updateStatus", (listaOnline) => {
    listaOnlineGlobal = listaOnline;
    renderContacts();
    if (currentChat) {
        const estaOnline = listaOnline.includes(currentChat.id);
        const statusDiv = document.getElementById("typingStatus");
        if (statusDiv) {
            statusDiv.textContent = estaOnline ? "Online" : "offline";
            statusDiv.style.color = estaOnline ? "#25D366" : "#dcdcdc";
        }
    }
});

function renderContacts() {
    const div = document.getElementById("contacts");
    if(!div) return;
    div.innerHTML = "";

    contacts.forEach(user => {
        const count = unreadCounts[user.id] || 0;
        const isOnline = listaOnlineGlobal.includes(user.id);

        const contactEl = document.createElement("div");
        contactEl.className = "contact";
        contactEl.style.display = "flex";
        contactEl.style.alignItems = "center";
        
        contactEl.innerHTML = `
            <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" style="width:40px;height:40px;border-radius:50%;margin-right:10px;object-fit:cover;">
            <div style="flex:1;">
                <div style="font-weight:bold;">${user.username}</div>
                <div style="font-size:11px; color:${isOnline ? '#25D366' : 'gray'}">
                    ${isOnline ? '● Online' : '● Offline'}
                </div>
            </div>
            ${count > 0 ? `<span style="background:red;color:white;border-radius:50%;padding:2px 8px;font-size:12px;">${count}</span>` : ""}
        `;

        contactEl.onclick = () => abrirChat(user);
        div.appendChild(contactEl);
    });
}

async function loadMessages() {
    const res = await fetch(`/getMessages/${currentUser.id}`);
    const msgs = await res.json();
    
    for (let m of msgs) {
        if (m.timestamp > lastTimestamp) {
            lastTimestamp = m.timestamp;

            if (m.toId == currentUser.id) {
                const index = contacts.findIndex(c => c.id == m.fromId);
                
                if (index === -1) {
                    const resUser = await fetch(`/getUser/${m.fromId}`);
                    const newUser = await resUser.json();
                    if (!newUser.error) {
                        contacts.unshift(newUser);
                    }
                } else {
                    // Atualiza os dados do contato (caso ele tenha mudado de nome/foto)
                    const resUser = await fetch(`/getUser/${m.fromId}`);
                    const updatedUser = await resUser.json();
                    if(!updatedUser.error) contacts[index] = updatedUser;
                }
                
                localStorage.setItem("contacts", JSON.stringify(contacts));

                if (currentChat?.id !== m.fromId) {
                    unreadCounts[m.fromId] = (unreadCounts[m.fromId] || 0) + 1;
                }
            }
        }
    }

    localStorage.setItem("lastTimestamp", lastTimestamp);
    localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
    renderContacts();

    if (!currentChat) return;

    const filtered = msgs.filter(m => 
        (m.fromId == currentUser.id && m.toId == currentChat.id) || 
        (m.fromId == currentChat.id && m.toId == currentUser.id)
    );

    const container = document.getElementById("messages");
    container.innerHTML = "";
    filtered.forEach(addMessage);
    container.scrollTop = container.scrollHeight;
}

function addMessage(m) {
    const container = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
    div.innerHTML = `<div class="bubble">${m.text}</div>`;
    container.appendChild(div);
}

function abrirChat(user) {
    currentChat = user;
    unreadCounts[user.id] = 0;
    localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
    
    document.getElementById("home").style.display = "none";
    document.getElementById("chatScreen").style.display = "flex";
    document.getElementById("chatName").textContent = user.username;
    document.getElementById("chatAvatar").src = user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

    const estaOnline = listaOnlineGlobal.includes(user.id);
    const statusDiv = document.getElementById("typingStatus");
    statusDiv.textContent = estaOnline ? "Online" : "offline";
    statusDiv.style.color = estaOnline ? "#25D366" : "#dcdcdc";

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
    if(user.error) return alert("Não encontrado");
    if(!contacts.some(c => c.id == id)) {
        contacts.unshift(user);
        localStorage.setItem("contacts", JSON.stringify(contacts));
        renderContacts();
    }
    document.getElementById("addUserId").value = "";
};
