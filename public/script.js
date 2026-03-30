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

// ATUALIZAÇÃO DE PERFIL
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
});

// FUNÇÕES DE EXCLUSÃO
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

function abrirModal() { document.getElementById("confirmModal").style.display = "flex"; }
function fecharModal() { document.getElementById("confirmModal").style.display = "none"; }

function confirmarExclusao() {
    contacts = contacts.filter(c => c.id !== contatoSelecionadoId);
    localStorage.setItem("contacts", JSON.stringify(contacts));
    fecharModal();
    cancelarSelecao();
}

function renderContacts() {
    const div = document.getElementById("contacts");
    div.innerHTML = "";
    contacts.forEach(user => {
        const count = unreadCounts[user.id] || 0;
        const isOnline = listaOnlineGlobal.includes(user.id);
        const isSelected = contatoSelecionadoId === user.id;

        const contactEl = document.createElement("div");
        contactEl.className = `contact ${isSelected ? 'selected' : ''}`;
        contactEl.style.display = "flex";
        contactEl.style.alignItems = "center";
        contactEl.innerHTML = `
            <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" style="width:40px;height:40px;border-radius:50%;margin-right:10px;object-fit:cover;">
            <div style="flex:1;">
                <div style="font-weight:bold;">${user.username}</div>
                <div style="font-size:11px; color:${isOnline ? '#25D366' : 'gray'}">${isOnline ? '● Online' : '● Offline'}</div>
            </div>
            ${count > 0 ? `<span style="background:red;color:white;border-radius:50%;padding:2px 8px;font-size:12px;">${count}</span>` : ""}
        `;

        let pressTimer;
        contactEl.onmousedown = () => pressTimer = setTimeout(() => ativarSelecao(user.id), 800);
        contactEl.onmouseup = () => clearTimeout(pressTimer);
        contactEl.ontouchstart = () => pressTimer = setTimeout(() => ativarSelecao(user.id), 800);
        contactEl.ontouchend = () => clearTimeout(pressTimer);

        contactEl.onclick = () => {
            if (contatoSelecionadoId) cancelarSelecao();
            else abrirChat(user);
        };
        div.appendChild(contactEl);
    });
}

// 🔥 CORREÇÃO: LOAD MESSAGES MAIS SEGURO
async function loadMessages() {
    try {
        const res = await fetch(`/getMessages/${currentUser.id}`);
        const msgs = await res.json();
        
        // Se der erro no servidor ou não vier array, para aqui
        if (!Array.isArray(msgs)) return;

        for (let m of msgs) {
            if (m.timestamp > lastTimestamp) {
                lastTimestamp = m.timestamp;
                
                if (m.toId == currentUser.id) {
                    const index = contacts.findIndex(c => c.id == m.fromId);
                    if (index === -1) {
                        const resUser = await fetch(`/getUser/${m.fromId}`);
                        const newUser = await resUser.json();
                        if (!newUser.error) contacts.unshift(newUser); 
                    } else {
                        const contatoMovido = contacts.splice(index, 1)[0];
                        contacts.unshift(contatoMovido);
                    }
                    if (currentChat?.id !== m.fromId) {
                        unreadCounts[m.fromId] = (unreadCounts[m.fromId] || 0) + 1;
                    }
                } 
                else if (m.fromId == currentUser.id) {
                    const index = contacts.findIndex(c => c.id == m.toId);
                    if (index !== -1) {
                        const contatoMovido = contacts.splice(index, 1)[0];
                        contacts.unshift(contatoMovido);
                    }
                }
            }
        }

        localStorage.setItem("lastTimestamp", lastTimestamp);
        localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
        localStorage.setItem("contacts", JSON.stringify(contacts));
        renderContacts();

        if (!currentChat) return;
        
        const filtered = msgs.filter(m => (m.fromId == currentUser.id && m.toId == currentChat.id) || (m.fromId == currentChat.id && m.toId == currentUser.id));
        
        const container = document.getElementById("messages");
        // 🔥 Só atualiza o DOM se realmente houver mudança na quantidade de mensagens
        if(container.dataset.count != filtered.length) {
            container.innerHTML = "";
            filtered.forEach(addMessage);
            container.scrollTop = container.scrollHeight;
            container.dataset.count = filtered.length; // Guarda a contagem atual
        }
    } catch (e) {
        console.log("Aguardando novas mensagens...");
    }
}

function addMessage(m) {
    const container = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
    
    const date = new Date(m.timestamp);
    const horarioFormatado = date.getHours().toString().padStart(2, '0') + ":" + date.getMinutes().toString().padStart(2, '0');

    div.innerHTML = `
        <div class="bubble">
            ${m.text}
            <span class="time">${horarioFormatado}</span>
        </div>
    `;
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
    
    const container = document.getElementById("messages");
    container.innerHTML = "";
    container.dataset.count = 0; // Reseta o contador ao mudar de chat
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

    // Envio Otimista
    const msgOtimista = {
        fromId: currentUser.id,
        toId: currentChat.id,
        text: text,
        timestamp: Date.now()
    };
    
    addMessage(msgOtimista);
    const container = document.getElementById("messages");
    container.scrollTop = container.scrollHeight;
    container.dataset.count = parseInt(container.dataset.count || 0) + 1; // Incrementa manual

    // Move contato topo
    const index = contacts.findIndex(c => c.id == currentChat.id);
    if (index !== -1) {
        const contatoMovido = contacts.splice(index, 1)[0];
        contacts.unshift(contatoMovido);
        renderContacts();
    }

    await fetch("/sendMessage", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ fromId: currentUser.id, toId: currentChat.id, text })
    });
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

document.getElementById("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const nome = document.getElementById("username").value.trim();
    const file = document.getElementById("profilePic").files[0];
    if (!nome) return alert("Digite um nome!");
    const salvar = async (f) => {
        await fetch("/saveProfile", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ id: currentUser.id, username: nome, photo: f })
        });
        currentUser.username = nome; currentUser.photo = f;
        socket.emit("updateProfileVisual", { id: currentUser.id, username: nome, photo: f });
        alert("Perfil Salvo!");
    };
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => salvar(ev.target.result);
        reader.readAsDataURL(file);
    } else salvar(currentUser.photo);
};
        ");
    };
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => salvar(ev.target.result);
        reader.readAsDataURL(file);
    } else salvar(currentUser.photo);
};
                     
