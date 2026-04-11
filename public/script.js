let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
let fotoParaEnviar = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;
let listaOnlineGlobal = [];

// Controle de Timer dos Momentos
let tempoStatus; 

function atualizarBadgeIcone() {
    const counts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
    const totalNaoLidas = Object.values(counts).reduce((a, b) => a + b, 0);
    if (navigator.setAppBadge) {
        if (totalNaoLidas > 0) navigator.setAppBadge(totalNaoLidas).catch(console.error);
        else navigator.clearAppBadge().catch(console.error);
    }
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installBanner').style.display = 'block';
});

document.getElementById('btnInstall').onclick = async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt = null;
        document.getElementById('installBanner').style.display = 'none';
    }
};

function recusarInstalacao() { document.getElementById('installBanner').style.display = 'none'; }

function aplicarTrava(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.addEventListener("touchstart", function() { if (el.scrollTop <= 0) el.scrollTop = 1; }, { passive: true });
}

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
    if(currentUser.photo) {
        document.getElementById("profilePreview").src = currentUser.photo;
        document.getElementById("minhaFotoMomento").src = currentUser.photo;
    }

    renderContacts();
    loadMomentos(); 
    atualizarBadgeIcone();
    
    setInterval(loadMessages, 1500);
    setInterval(loadMomentos, 30000); 
    aplicarTrava("messages");
});

// --- LÓGICA DE MOMENTOS (ESTILO WHATSAPP) ---

async function loadMomentos() {
    try {
        const res = await fetch("/getMomentos");
        const todosMomentos = await res.json();
        const container = document.getElementById("listaMomentos");
        container.innerHTML = "";

        const idsContatos = contacts.map(c => c.id);
        const grupos = {};

        todosMomentos.forEach(m => {
            const souEu = m.userId === currentUser.id;
            const ehMeuContato = idsContatos.includes(m.userId);

            if (souEu || ehMeuContato) {
                if (!grupos[m.userId]) {
                    grupos[m.userId] = {
                        username: souEu ? "Você" : m.username,
                        userPhoto: m.userPhoto,
                        midias: [] 
                    };
                }
                grupos[m.userId].midias.unshift(m.media);
            }
        });

        Object.keys(grupos).forEach(userId => {
            const g = grupos[userId];
            const item = document.createElement("div");
            item.className = "momento-item";
            item.onclick = () => abrirVisualizadorSequencial(g.midias);
            
            item.innerHTML = `
                <div class="momento-aro" style="border-color: ${userId === currentUser.id ? '#075e54' : '#25D366'}">
                    <img src="${g.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="momento-img">
                </div>
                <div style="font-size: 11px; margin-top: 5px; color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${g.username}</div>
            `;
            container.appendChild(item);
        });
    } catch (err) {
        console.error("Erro ao carregar momentos:", err);
    }
}

function abrirVisualizadorSequencial(listaFotos) {
    let indice = 0;
    const viewer = document.getElementById("fullScreenViewer");
    const img = document.getElementById("fullScreenImage");
    const progressContainer = document.getElementById("statusProgressBar");
    
    progressContainer.innerHTML = "";
    listaFotos.forEach(() => {
        const segment = document.createElement("div");
        segment.className = "status-segment";
        const filler = document.createElement("div");
        filler.className = "status-filler";
        segment.appendChild(filler);
        progressContainer.appendChild(segment);
    });

    const segmentosHtml = progressContainer.querySelectorAll(".status-segment");

    const mostrar = () => {
        clearTimeout(tempoStatus);

        if (indice >= listaFotos.length) {
            fecharFullScreen();
            return;
        }
        
        img.src = listaFotos[indice];
        viewer.style.display = "flex";

        segmentosHtml.forEach((seg, i) => {
            seg.classList.remove("active", "seen");
            if (i < indice) {
                seg.classList.add("seen");
            } else if (i === indice) {
                seg.style.display = 'none';
                seg.offsetHeight; 
                seg.style.display = 'flex';
                seg.classList.add("active");
            }
        });
        
        tempoStatus = setTimeout(() => {
            indice++;
            mostrar();
        }, 4000); 
    };

    mostrar();

    img.onclick = (e) => {
        e.stopPropagation();
        indice++;
        mostrar();
    };
}

async function postarNovoMomento(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64 = e.target.result;
        const btnCriar = document.querySelector(".add-momento");
        btnCriar.style.opacity = "0.5";

        await fetch("/postarMomento", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
                userId: currentUser.id,
                username: currentUser.username,
                userPhoto: currentUser.photo,
                media: base64
            })
        });
        
        btnCriar.style.opacity = "1";
        input.value = ""; 
        loadMomentos(); 
    };
    reader.readAsDataURL(file);
}

// --- FIM MOMENTOS ---

document.getElementById("sendPhoto").onchange = function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
        fotoParaEnviar = ev.target.result;
        document.getElementById("imagePreviewTarget").src = fotoParaEnviar;
        document.getElementById("photoPreviewContainer").style.display = "flex";
        document.getElementById("attachmentMenu").classList.add("hidden");
    };
    reader.readAsDataURL(file);
};

function cancelarEnvioFoto() {
    fotoParaEnviar = null;
    document.getElementById("photoPreviewContainer").style.display = "none";
}

function abrirFullScreen(src) {
    document.getElementById("fullScreenImage").src = src;
    document.getElementById("fullScreenViewer").style.display = "flex";
}

function fecharFullScreen() { 
    clearTimeout(tempoStatus);
    document.getElementById("fullScreenViewer").style.display = "none"; 
}

document.getElementById("sendMessageBtn").onclick = async () => {
    const input = document.getElementById("messageText");
    const text = input.value.trim();
    if ((!text && !fotoParaEnviar) || !currentChat) return;

    await fetch("/sendMessage", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ fromId: currentUser.id, toId: currentChat.id, text: fotoParaEnviar || text })
    });

    input.value = "";
    cancelarEnvioFoto();
    loadMessages();
};

async function loadMessages() {
    if (!currentChat) return;
    const res = await fetch(`/getMessages/${currentUser.id}`);
    const msgs = await res.json();
    const container = document.getElementById("messages");
    const filtered = msgs.filter(m => (m.fromId == currentUser.id && m.toId == currentChat.id) || (m.fromId == currentChat.id && m.toId == currentUser.id));
    
    if (container.childElementCount !== filtered.length) {
        container.innerHTML = "";
        filtered.forEach(addMessage);
        container.scrollTop = container.scrollHeight;
    }
}

function addMessage(m) {
    const container = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
    let conteudo = m.text.startsWith("data:image") ? `<img src="${m.text}" onclick="abrirFullScreen('${m.text}')">` : m.text;
    const date = new Date(m.timestamp);
    div.innerHTML = `<div class="bubble">${conteudo}<span class="time">${date.getHours()}:${date.getMinutes()}</span></div>`;
    container.appendChild(div);
}

socket.on("updateStatus", (listaOnline) => {
    listaOnlineGlobal = listaOnline;
    renderContacts();
    if (currentChat) {
        document.getElementById("typingStatus").textContent = listaOnlineGlobal.includes(currentChat.id) ? "Online" : "offline";
    }
});

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
        const isOnline = listaOnlineGlobal.includes(user.id);
        const contactEl = document.createElement("div");
        contactEl.className = `contact ${contatoSelecionadoId === user.id ? 'selected' : ''}`;
        contactEl.innerHTML = `
            <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" style="width:40px;height:40px;border-radius:50%;margin-right:10px;object-fit:cover;">
            <div style="flex:1;">
                <div style="font-weight:bold;">${user.username}</div>
                <div style="font-size:11px; color:${isOnline ? '#25D366' : 'gray'}">${isOnline ? '● Online' : '● Offline'}</div>
            </div>
        `;
        let pressTimer;
        contactEl.ontouchstart = () => pressTimer = setTimeout(() => ativarSelecao(user.id), 800);
        contactEl.ontouchend = () => clearTimeout(pressTimer);
        contactEl.onclick = () => { if (contatoSelecionadoId) cancelarSelecao(); else abrirChat(user); };
        div.appendChild(contactEl);
    });
}

// 🔥 ADICIONAR POR ID (FUNCIONAL)
document.getElementById("addFriendBtn").onclick = async () => {
    const idInput = document.getElementById("addUserId");
    const id = idInput.value.trim();
    
    if (!id) return;

    if (id === currentUser.id) {
        alert("Você não pode adicionar seu próprio ID.");
        return;
    }

    const jaExiste = contacts.find(c => c.id === id);
    if (jaExiste) {
        alert("Este contato já está na sua lista.");
        return;
    }

    try {
        const res = await fetch(`/getUser/${id}`);
        const user = await res.json();
        
        if(user.error) {
            alert("Usuário não encontrado.");
            return;
        }

        contacts.push(user);
        localStorage.setItem("contacts", JSON.stringify(contacts));
        renderContacts();
        idInput.value = "";
        alert("Contato adicionado com sucesso!");
    } catch (err) {
        console.error("Erro ao adicionar amigo:", err);
        alert("Erro ao buscar usuário.");
    }
};
                        
