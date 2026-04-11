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

    // --- NOVA FUNÇÃO: CLIQUE NA FOTO PARA MUDAR ---
    const preview = document.getElementById("profilePreview");
    const fileInput = document.getElementById("profilePic");

    preview.onclick = () => fileInput.click();

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                preview.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        }
    };
    // ----------------------------------------------

    renderContacts();
    setInterval(loadMessages, 1500);
});

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
    container.innerHTML = "";
    filtered.forEach(addMessage);
    container.scrollTop = container.scrollHeight;
}

function addMessage(m) {
    const container = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
    const date = new Date(m.timestamp);
    const hora = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    div.innerHTML = `
        <div class="bubble">
            ${m.text}
            <span class="time">${hora}:${min}</span>
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
    const estaOnline = listaOnlineGlobal.includes(user.id);
    document.getElementById("typingStatus").textContent = estaOnline ? "Online" : "offline";
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

document.getElementById("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const nome = document.getElementById("username").value.trim();
    const file = document.getElementById("profilePic").files[0];
    if (!nome) return alert("Digite um nome!");
    
    const salvar = async (fotoFinal) => {
        const res = await fetch("/saveProfile", {
            method: "POST", 
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ id: currentUser.id, username: nome, photo: fotoFinal })
        });
        
        if (res.ok) {
            currentUser.username = nome; 
            currentUser.photo = fotoFinal;
            if (fotoFinal) document.getElementById("profilePreview").src = fotoFinal;
            socket.emit("updateProfileVisual", { id: currentUser.id, username: nome, photo: fotoFinal });
            alert("Perfil Salvo!");
            renderContacts();
        }
    };
    
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const MAX_WIDTH = 300; 
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
                salvar(compressedBase64);
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    } else {
        salvar(currentUser.photo);
    }
};

// --- LÓGICA DE INSTALAÇÃO (PWA) ---
let deferredPrompt;

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
    .then(() => console.log("Service Worker registrado!"));
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const jaPerguntou = sessionStorage.getItem('pwaPrompt');

    if (!jaPerguntou) {
        setTimeout(() => {
            if (confirm("Deseja instalar o Mini Zap no seu celular?")) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('Usuário aceitou a instalação');
                    }
                    deferredPrompt = null;
                });
            }
            sessionStorage.setItem('pwaPrompt', 'true');
        }, 5000); 
    }
});
