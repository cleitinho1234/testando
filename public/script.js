let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
let fotoParaEnviar = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;
let listaOnlineGlobal = [];

// --- 1. NOTIFICAÇÕES E BADGE (NÚMERO NO ÍCONE) ---
function atualizarBadgeIcone() {
    const counts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
    const totalNaoLidas = Object.values(counts).reduce((a, b) => a + b, 0);

    if (navigator.setAppBadge) {
        if (totalNaoLidas > 0) {
            navigator.setAppBadge(totalNaoLidas).catch(console.error);
        } else {
            navigator.clearAppBadge().catch(console.error);
        }
    }

    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'UPDATE_BADGE',
            count: totalNaoLidas
        });
    }
}

// --- 2. LÓGICA DE INSTALAÇÃO (PWA) ---
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    const jaInstalou = localStorage.getItem("appInstalado");
    if (jaInstalou === "true") return;
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.getElementById('installBanner');
    if (banner) banner.style.display = 'block';
});

document.getElementById('btnInstall').onclick = async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            localStorage.setItem("appInstalado", "true");
            document.getElementById('installBanner').style.display = 'none';
        }
        deferredPrompt = null;
    }
};

function recusarInstalacao() {
    localStorage.setItem("appInstalado", "true"); 
    document.getElementById('installBanner').style.display = 'none';
}

// --- 3. CARREGAMENTO, TRAVAS E SERVICE WORKER ---
function aplicarTrava(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.addEventListener("touchstart", function() { if (el.scrollTop <= 0) el.scrollTop = 1; }, { passive: true });
    el.addEventListener("scroll", function() { if (el.scrollTop <= 0) el.scrollTop = 1; }, { passive: true });
}

window.addEventListener("load", async () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(() => console.log("Service Worker ativo!"))
            .catch(err => console.log("Erro SW:", err));
    }

    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }

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
    atualizarBadgeIcone();
    
    const lastChatId = localStorage.getItem("activeChatId");
    if (lastChatId) {
        const contatoSalvo = contacts.find(c => c.id == lastChatId);
        if (contatoSalvo) abrirChat(contatoSalvo);
    }

    aplicarTrava("messages");
    aplicarTrava("home");
    setInterval(loadMessages, 1500);
});

// --- 4. GESTÃO DE FOTOS ---
document.getElementById("sendPhoto").onchange = function(e) {
    const file = e.target.files[0];
    if (!file || !currentChat) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 600; 
            canvas.height = img.height * (600 / img.width);
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            fotoParaEnviar = canvas.toDataURL("image/jpeg", 0.8);
            document.getElementById("imagePreviewTarget").src = fotoParaEnviar;
            document.getElementById("photoPreviewContainer").style.display = "flex";
            document.getElementById("attachmentMenu").classList.add("hidden");
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
};

function cancelarEnvioFoto() {
    fotoParaEnviar = null;
    document.getElementById("photoPreviewContainer").style.display = "none";
    document.getElementById("sendPhoto").value = ""; 
}

function abrirFullScreen(src) {
    document.getElementById("fullScreenImage").src = src;
    document.getElementById("fullScreenViewer").style.display = "flex";
}

function fecharFullScreen() {
    document.getElementById("fullScreenViewer").style.display = "none";
}

// --- 5. MENSAGENS E ENVIO ---
document.getElementById("sendMessageBtn").onclick = async () => {
    const input = document.getElementById("messageText");
    const text = input.value.trim();
    if ((!text && !fotoParaEnviar) || !currentChat) return;

    if (fotoParaEnviar) {
        await fetch("/sendMessage", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ fromId: currentUser.id, toId: currentChat.id, text: fotoParaEnviar })
        });
        cancelarEnvioFoto();
    }
    if (text) {
        await fetch("/sendMessage", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ fromId: currentUser.id, toId: currentChat.id, text })
        });
        input.value = "";
    }
    await loadMessages();
    document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
};

async function loadMessages() {
    const res = await fetch(`/getMessages/${currentUser.id}`);
    const msgs = await res.json();
    let novaMensagem = false;

    for (let m of msgs) {
        if (m.timestamp > lastTimestamp) {
            lastTimestamp = m.timestamp;
            novaMensagem = true;
            if (m.toId == currentUser.id) {
                const index = contacts.findIndex(c => c.id == m.fromId);
                let remetenteNome = "Alguém";

                if (index === -1) {
                    const resUser = await fetch(`/getUser/${m.fromId}`);
                    const newUser = await resUser.json();
                    if (!newUser.error) {
                        contacts.unshift(newUser);
                        remetenteNome = newUser.username;
                    }
                } else {
                    const contatoMovido = contacts.splice(index, 1)[0];
                    contacts.unshift(contatoMovido);
                    remetenteNome = contatoMovido.username;
                }

                // LÓGICA DE NOTIFICAÇÃO ESTILO WHATSAPP
                if (currentChat?.id !== m.fromId) {
                    unreadCounts[m.fromId] = (unreadCounts[m.fromId] || 0) + 1;

                    // Envia para o Service Worker mostrar a notificação na aba do celular
                    if (navigator.serviceWorker.controller && Notification.permission === "granted") {
                        const corpoTexto = m.text.startsWith("data:image") ? "📷 Foto" : m.text;
                        navigator.serviceWorker.controller.postMessage({
                            type: 'SHOW_NOTIFICATION',
                            title: remetenteNome,
                            body: corpoTexto
                        });
                    }
                }
            } else if (m.fromId == currentUser.id) {
                const index = contacts.findIndex(c => c.id == m.toId);
                if (index !== -1) {
                    const contatoMovido = contacts.splice(index, 1)[0];
                    contacts.unshift(contatoMovido);
                }
            }
        }
    }

    if (novaMensagem) {
        localStorage.setItem("lastTimestamp", lastTimestamp);
        localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
        localStorage.setItem("contacts", JSON.stringify(contacts));
        renderContacts();
        atualizarBadgeIcone();
    }

    if (!currentChat) return;
    const container = document.getElementById("messages");
    const filtered = msgs.filter(m => (m.fromId == currentUser.id && m.toId == currentChat.id) || (m.fromId == currentChat.id && m.toId == currentUser.id));
    
    if (container.childElementCount !== filtered.length) {
        const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
        container.innerHTML = "";
        filtered.forEach(addMessage);
        if (isAtBottom) container.scrollTop = container.scrollHeight;
    }
}

function addMessage(m) {
    const container = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
    let conteudo = m.text.startsWith("data:image") ? `<img src="${m.text}" onclick="abrirFullScreen('${m.text}')">` : m.text;
    const date = new Date(m.timestamp);
    const hora = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    div.innerHTML = `<div class="bubble">${conteudo}<span class="time">${hora}:${min}</span></div>`;
    container.appendChild(div);
}

// --- 6. SOCKETS E PERFIL ---
socket.on("userUpdated", (dados) => {
    const index = contacts.findIndex(c => c.id == dados.id);
    if (index !== -1) {
        contacts[index].username = dados.username;
        contacts[index].photo = dados.photo;
        localStorage.setItem("contacts", JSON.stringify(contacts));
        renderContacts();
        if (currentChat && currentChat.id === dados.id) {
            document.getElementById("chatName").textContent = dados.username;
            document.getElementById("chatAvatar").src = dados.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        }
    }
});

socket.on("updateStatus", (listaOnline) => {
    listaOnlineGlobal = listaOnline;
    renderContacts();
    if (currentChat) {
        const estaOnline = listaOnlineGlobal.includes(currentChat.id);
        document.getElementById("typingStatus").textContent = estaOnline ? "Online" : "offline";
    }
});

function abrirChat(user) {
    currentChat = user;
    localStorage.setItem("activeChatId", user.id);
    unreadCounts[user.id] = 0;
    localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
    document.getElementById("home").style.display = "none";
    document.getElementById("chatScreen").style.display = "flex";
    document.getElementById("chatName").textContent = user.username;
    document.getElementById("chatAvatar").src = user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    cancelarEnvioFoto();
    loadMessages();
    atualizarBadgeIcone();
    setTimeout(() => { document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight; }, 150);
}

function voltar() {
    document.getElementById("chatScreen").style.display = "none";
    document.getElementById("home").style.display = "block";
    currentChat = null;
    localStorage.removeItem("activeChatId");
    cancelarEnvioFoto();
    renderContacts();
}

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
    fecharModal(); cancelarSelecao();
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
        contactEl.innerHTML = `
            <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" style="width:40px;height:40px;border-radius:50%;margin-right:10px;object-fit:cover;">
            <div style="flex:1;">
                <div style="font-weight:bold;">${user.username}</div>
                <div style="font-size:11px; color:${isOnline ? '#25D366' : 'gray'}">${isOnline ? '● Online' : '● Offline'}</div>
            </div>
            ${count > 0 ? `<span style="background:red;color:white;border-radius:50%;padding:2px 8px;font-size:12px;">${count}</span>` : ""}
        `;
        let pressTimer;
        contactEl.ontouchstart = () => pressTimer = setTimeout(() => ativarSelecao(user.id), 800);
        contactEl.ontouchend = () => clearTimeout(pressTimer);
        contactEl.onclick = () => { if (contatoSelecionadoId) cancelarSelecao(); else abrirChat(user); };
        div.appendChild(contactEl);
    });
}

document.getElementById("attachmentBtn").onclick = () => document.getElementById("attachmentMenu").classList.toggle("hidden");

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
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ id: currentUser.id, username: nome, photo: fotoFinal })
        });
        if (res.ok) {
            currentUser.username = nome; currentUser.photo = fotoFinal;
            if (fotoFinal) document.getElementById("profilePreview").src = fotoFinal;
            socket.emit("updateProfileVisual", { id: currentUser.id, username: nome, photo: fotoFinal });
            alert("Perfil Salvo!"); renderContacts();
        }
    };
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = 300; canvas.height = img.height * (300 / img.width);
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                salvar(canvas.toDataURL("image/jpeg", 0.7));
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    } else salvar(currentUser.photo);
};
