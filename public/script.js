let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;
let listaOnlineGlobal = [];

window.addEventListener("load", async () => {
    // Tenta carregar do cache local para o nome aparecer instantaneamente
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
    
    if(currentUser.photo) document.getElementById("profilePreview").src = currentUser.photo;

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

    renderContacts();
    setInterval(loadMessages, 1500);
});

// ESCUTAR ATUALIZAÇÃO DE PERFIL EM TEMPO REAL
socket.on("userUpdated", (dados) => {
    const index = contacts.findIndex(c => c.id == dados.id);
    if (index !== -1) {
        contacts[index].username = dados.username;
        contacts[index].photo = dados.photo;
        localStorage.setItem("contacts", JSON.stringify(contacts));
        renderContacts();
    }

    if (currentChat && currentChat.id == dados.id) {
        currentChat.username = dados.username;
        currentChat.photo = dados.photo;
        document.getElementById("chatName").textContent = dados.username;
        document.getElementById("chatAvatar").src = dados.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
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
    await fetch("/api/messages", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ fromId: currentUser.id, toId: currentChat.id, text })
    });
    loadMessages();
};

document.getElementById("addFriendBtn").onclick = async () => {
    const id = document.getElementById("addUserId").value.trim();
    if(!id || id == currentUser.id) return;
    const res = await fetch(`/api/user/${id}`);
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
    const previewAtual = document.getElementById("profilePreview").src;
    
    if (!nome) return alert("Digite um nome!");
    
    const salvar = async (fotoFinal) => {
        const res = await fetch("/api/saveProfile", {
            method: "POST", 
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ id: currentUser.id, username: nome, photo: fotoFinal })
        });
        
        if (res.ok) {
            // ATUALIZAÇÃO LOCAL: Aqui garantimos que o nome fique fixo
            currentUser.username = nome; 
            currentUser.photo = fotoFinal;
            localStorage.setItem("myUserObject", JSON.stringify(currentUser));
            
            socket.emit("updateProfileVisual", { id: currentUser.id, username: nome, photo: fotoFinal });
            
            alert("Perfil Salvo!");
            renderContacts();
        } else {
            alert("Erro ao salvar perfil no servidor.");
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
        // Se não mudou a foto, envia o que já está no preview
        salvar(previewAtual);
    }
};

// --- LÓGICA PWA ---
let deferredPrompt;
const installBanner = document.getElementById("installBanner");

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log(err));
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (!isStandalone && installBanner) installBanner.style.display = "block";
});

if(installBanner) {
    installBanner.onclick = () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(() => {
                installBanner.style.display = "none";
                deferredPrompt = null;
            });
        }
    };
}
