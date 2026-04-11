let currentUser = null;
let currentChat = null;
let fotoParaEnviar = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let listaOnlineGlobal = [];
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
    atualizarUIUsuario();
    renderContacts();
    loadMomentos(); 
    setInterval(loadMessages, 1500);
    setInterval(loadMomentos, 15000); 
});

function atualizarUIUsuario() {
    document.getElementById("username").value = currentUser.username || "";
    document.getElementById("userIdDisplay").textContent = currentUser.id;
    const foto = currentUser.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById("profilePreview").src = foto;
    document.getElementById("minhaFotoMomento").src = foto;
}

// 🔥 FUNÇÃO PARA ESCOLHER FOTO DE PERFIL
document.getElementById("profilePreview").onclick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
            currentUser.photo = ev.target.result;
            document.getElementById("profilePreview").src = currentUser.photo;
            document.getElementById("minhaFotoMomento").src = currentUser.photo;
        };
        reader.readAsDataURL(file);
    };
    input.click();
};

document.getElementById("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    await fetch("/updateUser", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ id: currentUser.id, username: document.getElementById("username").value, photo: currentUser.photo })
    });
    alert("Perfil Salvo!");
};

// --- MOMENTOS ---
async function loadMomentos() {
    const res = await fetch("/getMomentos");
    const todos = await res.json();
    const container = document.getElementById("listaMomentos");
    container.innerHTML = "";
    const grupos = {};

    todos.forEach(m => {
        if (m.userId === currentUser.id || contacts.find(c => c.id === m.userId)) {
            if (!grupos[m.userId]) grupos[m.userId] = { username: m.userId === currentUser.id ? "Você" : m.username, userPhoto: m.userPhoto, posts: [] };
            grupos[m.userId].posts.unshift(m);
        }
    });

    Object.keys(grupos).forEach(uId => {
        const g = grupos[uId];
        const item = document.createElement("div");
        item.className = "momento-item";
        item.onclick = () => abrirVisualizadorSequencial(g.posts);
        item.innerHTML = `<div class="momento-aro" style="border-color:${uId === currentUser.id ? '#075e54' : '#25D366'}"><img src="${g.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="momento-img"></div><div style="font-size:11px;margin-top:5px;">${g.username}</div>`;
        container.appendChild(item);
    });
}

function abrirVisualizadorSequencial(posts) {
    grupoDeMomentosAtual = posts; indiceMomentoAtual = 0;
    const progress = document.getElementById("statusProgressBar");
    progress.innerHTML = "";
    posts.forEach(() => progress.innerHTML += '<div class="status-segment"><div class="status-filler"></div></div>');

    const mostrar = () => {
        clearTimeout(tempoStatus);
        if (indiceMomentoAtual >= posts.length) return fecharFullScreen();
        const m = posts[indiceMomentoAtual];
        document.getElementById("fullScreenImage").src = m.media;
        document.getElementById("fullScreenViewer").style.display = "flex";

        if (m.userId !== currentUser.id) fetch("/visualizarMomento", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ momentoId: m.id, viewerId: currentUser.id }) });
        
        atualizarUIStatus(m);
        const segs = progress.querySelectorAll(".status-segment");
        segs.forEach((s, i) => {
            s.classList.remove("active", "seen");
            if (i < indiceMomentoAtual) s.classList.add("seen");
            else if (i === indiceMomentoAtual) { s.style.display='none'; s.offsetHeight; s.style.display='flex'; s.classList.add("active"); }
        });
        tempoStatus = setTimeout(() => { indiceMomentoAtual++; mostrar(); }, 4000);
    };
    mostrar();
    document.getElementById("fullScreenImage").onclick = () => { indiceMomentoAtual++; mostrar(); };
}

function atualizarUIStatus(m) {
    const isMine = m.userId === currentUser.id;
    document.getElementById("iconeOlhinho").style.display = isMine ? "inline" : "none";
    document.getElementById("numViews").textContent = isMine ? (m.visualizacoes ? m.visualizacoes.length : 0) : "";
    document.getElementById("btnCurtir").classList.toggle("active", m.curtidas && m.curtidas.includes(currentUser.id));
}

function toggleCurtir() {
    const m = grupoDeMomentosAtual[indiceMomentoAtual];
    fetch("/curtirMomento", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ momentoId: m.id, userId: currentUser.id }) })
    .then(r => r.json()).then(data => { m.curtidas = data.curtidas; atualizarUIStatus(m); });
}

function abrirListaQuemViu() {
    const m = grupoDeMomentosAtual[indiceMomentoAtual];
    if (m.userId !== currentUser.id) return;
    const modal = document.getElementById("viewerListModal");
    const lista = document.getElementById("listaDeQuemViu");
    lista.innerHTML = "";
    modal.style.display = "flex";
    m.visualizacoes.forEach(vId => {
        const c = contacts.find(con => con.id === vId);
        const nome = c ? c.username : (vId === currentUser.id ? "Você" : "Visitante");
        lista.innerHTML += `<div class="viewer-item"><span>${nome}${m.curtidas.includes(vId) ? ' ❤️' : ''}</span></div>`;
    });
}

function fecharFullScreen() { 
    clearTimeout(tempoStatus);
    document.getElementById("fullScreenViewer").style.display = "none"; 
    document.getElementById("viewerListModal").style.display = "none";
}

async function postarNovoMomento(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        await fetch("/postarMomento", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ userId: currentUser.id, username: currentUser.username, userPhoto: currentUser.photo, media: e.target.result }) });
        input.value = ""; loadMomentos(); 
    };
    reader.readAsDataURL(file);
}

// --- CHAT ---
document.getElementById("sendMessageBtn").onclick = async () => {
    const input = document.getElementById("messageText");
    const val = input.value.trim();
    if (!val || !currentChat) return;
    await fetch("/sendMessage", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ fromId: currentUser.id, toId: currentChat.id, text: val }) });
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
        filtered.forEach(m => { container.innerHTML += `<div class="message ${m.fromId == currentUser.id ? 'me' : 'other'}"><div class="bubble">${m.text}</div></div>`; });
        container.scrollTop = container.scrollHeight;
    }
}

function renderContacts() {
    const div = document.getElementById("contacts");
    div.innerHTML = "";
    contacts.forEach(u => {
        const el = document.createElement("div"); el.className = "contact";
        el.innerHTML = `<img src="${u.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" style="width:40px;height:40px;border-radius:50%;margin-right:10px;object-fit:cover;"><strong>${u.username}</strong>`;
        el.onclick = () => { currentChat = u; document.getElementById("home").style.display = "none"; document.getElementById("chatScreen").style.display = "flex"; document.getElementById("chatName").textContent = u.username; document.getElementById("chatAvatar").src = u.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'; loadMessages(); };
        div.appendChild(el);
    });
}

function voltar() { document.getElementById("chatScreen").style.display = "none"; document.getElementById("home").style.display = "block"; currentChat = null; }

document.getElementById("addFriendBtn").onclick = async () => {
    const id = document.getElementById("addUserId").value.trim();
    if (!id || id === currentUser.id || contacts.find(c => c.id === id)) return alert("ID inválido ou já existente");
    const res = await fetch(`/getUser/${id}`);
    const user = await res.json();
    if(user.error) return alert("Não encontrado");
    contacts.push(user); localStorage.setItem("contacts", JSON.stringify(contacts));
    renderContacts(); document.getElementById("addUserId").value = "";
};
                                        
