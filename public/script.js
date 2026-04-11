let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
let fotoParaEnviar = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;
let listaOnlineGlobal = [];

// Variáveis para Momentos
let tempoStatus; 
let grupoDeMomentosAtual = [];
let indiceMomentoAtual = 0;

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
    
    renderContacts();
    loadMomentos(); 
    setInterval(loadMessages, 1500);
    setInterval(loadMomentos, 15000); 
});

// --- LÓGICA DE MOMENTOS (CURTIDAS E VIEWS) ---

async function loadMomentos() {
    try {
        const res = await fetch("/getMomentos");
        const todosMomentos = await res.json();
        const container = document.getElementById("listaMomentos");
        container.innerHTML = "";

        const idsContatos = contacts.map(c => c.id);
        const grupos = {};

        // Agrupando por usuário, mas mantendo o objeto completo da mídia
        todosMomentos.forEach(m => {
            const souEu = m.userId === currentUser.id;
            const ehMeuContato = idsContatos.includes(m.userId);

            if (souEu || ehMeuContato) {
                if (!grupos[m.userId]) {
                    grupos[m.userId] = {
                        username: souEu ? "Você" : m.username,
                        userPhoto: m.userPhoto,
                        posts: [] 
                    };
                }
                grupos[m.userId].posts.unshift(m); // Adiciona o objeto completo
            }
        });

        Object.keys(grupos).forEach(userId => {
            const g = grupos[userId];
            const item = document.createElement("div");
            item.className = "momento-item";
            item.onclick = () => abrirVisualizadorSequencial(g.posts);
            
            item.innerHTML = `
                <div class="momento-aro" style="border-color: ${userId === currentUser.id ? '#075e54' : '#25D366'}">
                    <img src="${g.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="momento-img">
                </div>
                <div style="font-size: 11px; margin-top: 5px; color: #555;">${g.username}</div>
            `;
            container.appendChild(item);
        });
    } catch (err) { console.error(err); }
}

function abrirVisualizadorSequencial(posts) {
    grupoDeMomentosAtual = posts;
    indiceMomentoAtual = 0;
    
    const viewer = document.getElementById("fullScreenViewer");
    const img = document.getElementById("fullScreenImage");
    const progressContainer = document.getElementById("statusProgressBar");
    
    progressContainer.innerHTML = "";
    posts.forEach(() => {
        const seg = document.createElement("div");
        seg.className = "status-segment";
        seg.innerHTML = '<div class="status-filler"></div>';
        progressContainer.appendChild(seg);
    });

    const segmentos = progressContainer.querySelectorAll(".status-segment");

    const mostrar = () => {
        clearTimeout(tempoStatus);
        if (indiceMomentoAtual >= posts.length) { fecharFullScreen(); return; }
        
        const m = posts[indiceMomentoAtual];
        img.src = m.media;
        viewer.style.display = "flex";

        // Registrar visualização (avisa o servidor)
        if (m.userId !== currentUser.id) {
            fetch("/visualizarMomento", {
                method: "POST",
                headers: {"Content-Type":"application/json"},
                body: JSON.stringify({ momentoId: m.id, viewerId: currentUser.id })
            });
        }

        atualizarUIStatus(m);

        segmentos.forEach((seg, i) => {
            seg.classList.remove("active", "seen");
            if (i < indiceMomentoAtual) seg.classList.add("seen");
            else if (i === indiceMomentoAtual) {
                seg.style.display = 'none'; seg.offsetHeight; seg.style.display = 'flex';
                seg.classList.add("active");
            }
        });
        
        tempoStatus = setTimeout(() => { indiceMomentoAtual++; mostrar(); }, 4000);
    };

    mostrar();
    img.onclick = () => { indiceMomentoAtual++; mostrar(); };
}

function atualizarUIStatus(m) {
    const btnLike = document.getElementById("btnCurtir");
    const numViews = document.getElementById("numViews");
    const iconeOlhinho = document.getElementById("iconeOlhinho");

    // Se o status é meu, mostro o olhinho e permito clicar para ver a lista
    if (m.userId === currentUser.id) {
        iconeOlhinho.style.display = "inline";
        numViews.textContent = m.visualizacoes ? m.visualizacoes.length : 0;
        document.getElementById("viewControl").style.pointerEvents = "auto";
    } else {
        // Se é de outro, escondo o olhinho (opcional) e mostro apenas o coração
        iconeOlhinho.style.display = "none";
        numViews.textContent = "";
        document.getElementById("viewControl").style.pointerEvents = "none";
    }

    // Ativa o coração se eu já curti
    const jaCurti = m.curtidas && m.curtidas.includes(currentUser.id);
    btnLike.classList.toggle("active", jaCurti);
}

function toggleCurtir() {
    const m = grupoDeMomentosAtual[indiceMomentoAtual];
    fetch("/curtirMomento", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ momentoId: m.id, userId: currentUser.id })
    }).then(res => res.json()).then(data => {
        m.curtidas = data.curtidas; // Atualiza localmente o objeto
        atualizarUIStatus(m);
    });
}

function abrirListaQuemViu() {
    const m = grupoDeMomentosAtual[indiceMomentoAtual];
    if (m.userId !== currentUser.id) return;

    const modal = document.getElementById("viewerListModal");
    const lista = document.getElementById("listaDeQuemViu");
    lista.innerHTML = "";
    modal.style.display = "flex";

    if (m.visualizacoes) {
        m.visualizacoes.forEach(vId => {
            // Tenta achar o nome nos contatos ou no próprio usuário
            const contato = contacts.find(c => c.id === vId);
            const nome = contato ? contato.username : (vId === currentUser.id ? "Você" : "Alguém");
            const deuLike = m.curtidas && m.curtidas.includes(vId) ? " ❤️" : "";

            const item = document.createElement("div");
            item.className = "viewer-item";
            item.innerHTML = `<span>${nome}${deuLike}</span>`;
            lista.appendChild(item);
        });
    }
}

function fecharFullScreen() { 
    clearTimeout(tempoStatus);
    document.getElementById("fullScreenViewer").style.display = "none"; 
    document.getElementById("viewerListModal").style.display = "none";
}

// --- FUNÇÕES DE CHAT E CONTATOS (MANTIDAS) ---

async function postarNovoMomento(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        await fetch("/postarMomento", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
                userId: currentUser.id, username: currentUser.username,
                userPhoto: currentUser.photo, media: e.target.result
            })
        });
        input.value = ""; loadMomentos(); 
    };
    reader.readAsDataURL(file);
}

document.getElementById("sendMessageBtn").onclick = async () => {
    const input = document.getElementById("messageText");
    const text = input.value.trim();
    if (!text || !currentChat) return;
    await fetch("/sendMessage", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ fromId: currentUser.id, toId: currentChat.id, text: text })
    });
    input.value = ""; loadMessages();
};

async function loadMessages() {
    if (!currentChat) return;
    const res = await fetch(`/getMessages/${currentUser.id}`);
    const msgs = await res.json();
    const container = document.getElementById("messages");
    const filtered = msgs.filter(m => (m.fromId == currentUser.id && m.toId == currentChat.id) || (m.fromId == currentChat.id && m.toId == currentUser.id));
    if (container.childElementCount !== filtered.length) {
        container.innerHTML = "";
        filtered.forEach(m => {
            const div = document.createElement("div");
            div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
            div.innerHTML = `<div class="bubble">${m.text}</div>`;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    }
}

function renderContacts() {
    const div = document.getElementById("contacts");
    div.innerHTML = "";
    contacts.forEach(user => {
        const contactEl = document.createElement("div");
        contactEl.className = `contact ${contatoSelecionadoId === user.id ? 'selected' : ''}`;
        contactEl.innerHTML = `<img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" style="width:40px;height:40px;border-radius:50%;margin-right:10px;object-fit:cover;">
                               <strong>${user.username}</strong>`;
        contactEl.onclick = () => abrirChat(user);
        div.appendChild(contactEl);
    });
}

function abrirChat(user) {
    currentChat = user;
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
}

document.getElementById("addFriendBtn").onclick = async () => {
    const id = document.getElementById("addUserId").value.trim();
    if (!id || id === currentUser.id) return alert("ID inválido");
    if (contacts.find(c => c.id === id)) return alert("Já adicionado");
    const res = await fetch(`/getUser/${id}`);
    const user = await res.json();
    if(user.error) return alert("Não encontrado");
    contacts.push(user);
    localStorage.setItem("contacts", JSON.stringify(contacts));
    renderContacts();
    document.getElementById("addUserId").value = "";
};
            
