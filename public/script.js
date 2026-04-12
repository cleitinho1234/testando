let currentUser = null;
let currentChat = null;
let contatoSelecionadoId = null; 
const socket = io(); 

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;
let listaOnlineGlobal = [];
let mediaParaEnviar = null; 

// --- VARIÁVEIS PARA ÁUDIO E LIGAÇÃO ---
let mediaRecorder;
let audioChunks = [];
let audioBlob;
let timerInterval;
let seconds = 0;
const ringtone = document.getElementById("ringtone");
let chamandoAgora = null;

// VARIÁVEIS WebRTC (VOZ EM TEMPO REAL)
let peer;
let streamLocal;

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

// --- LÓGICA DE LIGAÇÃO E VOZ WebRTC ---

async function obterMediaPrivado() {
    try {
        streamLocal = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        return streamLocal;
    } catch (err) {
        alert("Erro ao acessar microfone para chamada: " + err);
    }
}

async function iniciarChamada() {
    if (!currentChat) return;
    
    // 1. Liga o microfone
    await obterMediaPrivado();

    // 2. Cria a conexão Peer (Iniciador)
    peer = new SimplePeer({ initiator: true, trickle: false, stream: streamLocal });

    // 3. Quando gerar o sinal de áudio, envia pelo socket
    peer.on('signal', sinal => {
        const dadosChamada = {
            de: currentUser.id,
            deNome: currentUser.username,
            deFoto: currentUser.photo,
            para: currentChat.id,
            sinal: sinal // Envia os dados técnicos da conexão
        };
        socket.emit("ligarPara", dadosChamada);
    });

    // 4. Quando receber a voz do outro, toca no alto-falante
    peer.on('stream', streamRemota => {
        const audioRemoto = new Audio();
        audioRemoto.srcObject = streamRemota;
        audioRemoto.play();
    });
    
    abrirTelaChamada(currentChat.username, currentChat.photo, "Chamando...");
    document.getElementById("btnAceitar").style.display = "none";
    ringtone.play().catch(e => console.log("Áudio bloqueado"));
}

socket.on("recebendoLigacao", (dados) => {
    chamandoAgora = dados;
    abrirTelaChamada(dados.deNome, dados.deFoto, "Recebendo chamada...");
    document.getElementById("btnAceitar").style.display = "flex";
    ringtone.play().catch(e => console.log("Áudio bloqueado"));
});

// Escuta quando o outro lado aceita a chamada
socket.on("chamadaAceita", (dados) => {
    ringtone.pause();
    ringtone.currentTime = 0;
    document.getElementById("callStatusText").textContent = "Em chamada...";
    
    // Conecta o áudio com o sinal que veio de volta
    if (dados && dados.sinal) {
        peer.signal(dados.sinal);
    }
});

async function aceitarChamada() {
    ringtone.pause();
    ringtone.currentTime = 0;
    document.getElementById("callStatusText").textContent = "Em chamada...";
    document.getElementById("btnAceitar").style.display = "none";
    
    if(chamandoAgora) {
        // 1. Liga o microfone de quem atendeu
        await obterMediaPrivado();

        // 2. Cria o Peer (Receptor)
        peer = new SimplePeer({ initiator: false, trickle: false, stream: streamLocal });

        // 3. Gera o sinal de volta para quem ligou
        peer.on('signal', sinal => {
            socket.emit("aceitarChamada", { para: chamandoAgora.de, sinal: sinal });
        });

        // 4. Recebe o som de quem ligou
        peer.on('stream', streamRemota => {
            const audioRemoto = new Audio();
            audioRemoto.srcObject = streamRemota;
            audioRemoto.play();
        });

        // 5. Processa o sinal de quem ligou para fechar a conexão
        peer.signal(chamandoAgora.sinal);
    }
}

function recusarChamada() {
    ringtone.pause();
    ringtone.currentTime = 0;
    document.getElementById("incomingCallScreen").style.display = "none";
    
    // Para o microfone se estiver ligado
    if (streamLocal) {
        streamLocal.getTracks().forEach(t => t.stop());
    }

    if(chamandoAgora) {
        socket.emit("chamadaRecusada", { para: chamandoAgora.de });
        chamandoAgora = null;
    } else if (currentChat) {
        socket.emit("chamadaRecusada", { para: currentChat.id });
    }
}

socket.on("chamadaEncerrada", () => {
    ringtone.pause();
    ringtone.currentTime = 0;
    document.getElementById("incomingCallScreen").style.display = "none";
    if (streamLocal) {
        streamLocal.getTracks().forEach(t => t.stop());
    }
    chamandoAgora = null;
});

function abrirTelaChamada(nome, foto, status) {
    document.getElementById("callerName").textContent = nome;
    document.getElementById("callerPhoto").src = foto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById("callStatusText").textContent = status;
    document.getElementById("incomingCallScreen").style.display = "flex";
}

// --- LÓGICA DE MÍDIA (FOTOS/VÍDEOS) ---
document.getElementById("addMediaBtn").onclick = () => {
    document.getElementById("mediaInput").click();
};

document.getElementById("mediaInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        mediaParaEnviar = {
            data: ev.target.result,
            type: file.type.startsWith('image') ? 'image' : 'video'
        };

        exibirPreviewMedia();
    };
    reader.readAsDataURL(file);
};

function exibirPreviewMedia() {
    const container = document.getElementById("mediaPreviewContainer");
    const content = document.getElementById("mediaPreviewContent");
    
    container.style.display = "flex";
    
    if (mediaParaEnviar.type === 'image') {
        content.innerHTML = `<img src="${mediaParaEnviar.data}">`;
    } else if (mediaParaEnviar.type === 'video') {
        content.innerHTML = `<video src="${mediaParaEnviar.data}"></video>`;
    } else if (mediaParaEnviar.type === 'audio') {
        content.innerHTML = `
            <div style="display:flex; align-items:center; background:#fff; padding:5px 10px; border-radius:8px; border:1px solid #ddd;">
                <span style="font-size:20px; margin-right:10px;">🎵</span>
                <span style="font-size:12px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${mediaParaEnviar.name || 'Áudio Externo'}
                </span>
            </div>`;
    }

    audioBtn.style.display = "none";
    sendTextBtn.style.display = "flex";
}

function cancelarEnvioMedia() {
    mediaParaEnviar = null;
    document.getElementById("mediaPreviewContainer").style.display = "none";
    document.getElementById("mediaInput").value = "";

    if (messageInput.value.trim() === "") {
        audioBtn.style.display = "flex";
        sendTextBtn.style.display = "none";
    }
}

// --- LÓGICA DO MICROFONE (GRAVAÇÃO DE MENSAGEM DE VOZ) ---
const audioBtn = document.getElementById("audioControlBtn");
const messageInput = document.getElementById("messageText");
const sendTextBtn = document.getElementById("sendMessageBtn");
const recordBar = document.getElementById("recordBar");
const previewAudioBtn = document.getElementById("previewAudioBtn");

messageInput.oninput = () => {
    const temTexto = messageInput.value.trim() !== "";
    if (temTexto || mediaParaEnviar) {
        audioBtn.style.display = "none";
        sendTextBtn.style.display = "flex";
    } else {
        audioBtn.style.display = "flex";
        sendTextBtn.style.display = "none";
    }
};

audioBtn.onclick = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        };

        mediaRecorder.start();
        recordBar.style.display = "flex";
        previewAudioBtn.style.display = "none"; 
        document.getElementById("pauseRecord").style.display = "block";
        iniciarTimer();
    } catch (err) {
        alert("Para mandar áudio, você precisa permitir o microfone!");
    }
};

function iniciarTimer() {
    seconds = 0;
    document.getElementById("recordTimer").textContent = "0:00";
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        seconds++;
        let m = Math.floor(seconds / 60);
        let s = seconds % 60;
        document.getElementById("recordTimer").textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }, 1000);
}

function pararMicrofone() {
    if (mediaRecorder && mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

document.getElementById("pauseRecord").onclick = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        pararMicrofone();
        clearInterval(timerInterval);
        document.getElementById("pauseRecord").style.display = "none";
        previewAudioBtn.style.display = "block";
        previewAudioBtn.textContent = "▶️";
    }
};

previewAudioBtn.onclick = () => {
    if (audioBlob) {
        const url = URL.createObjectURL(audioBlob);
        const previewAudio = new Audio(url);
        previewAudio.play();
        
        previewAudioBtn.textContent = "🔊";
        previewAudio.onended = () => { previewAudioBtn.textContent = "▶️"; };
    }
};

document.getElementById("deleteAudio").onclick = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }
    pararMicrofone();
    recordBar.style.display = "none";
    clearInterval(timerInterval);
    previewAudioBtn.style.display = "none";
    previewAudioBtn.textContent = "▶️";
    audioBlob = null;
};

document.getElementById("sendAudioBtn").onclick = async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        pararMicrofone();
    }

    setTimeout(async () => {
        if (!audioBlob) return;
        
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
            const base64Audio = reader.result;
            
            const payload = {
                fromId: currentUser.id,
                toId: currentChat.id,
                text: "",
                media: { data: base64Audio, type: 'audio' }
            };

            await fetch("/sendMessage", {
                method: "POST",
                headers: {"Content-Type":"application/json"},
                body: JSON.stringify(payload)
            });
            
            recordBar.style.display = "none";
            previewAudioBtn.style.display = "none";
            audioBlob = null;
            loadMessages();
        };
    }, 200);
};

// --- RESTANTE DAS FUNÇÕES (Sincronização e UI) ---

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
    const container = document.getElementById("messages");

    const estaNoFinal = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
    
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

                if (!currentChat || currentChat.id != m.fromId) {
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
    
    if (container.children.length !== filtered.length) {
        container.innerHTML = "";
        filtered.forEach(addMessage);
        
        if (estaNoFinal) {
            container.scrollTop = container.scrollHeight;
        }
    }
}

function addMessage(m) {
    const container = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
    
    const date = new Date(m.timestamp);
    const hora = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');

    let mediaHtml = "";
    if (m.media) {
        if (m.media.type === 'image') {
            mediaHtml = `<img src="${m.media.data}" onclick="abrirFullscreen('${m.media.data}', 'image')" style="cursor:pointer;">`; 
        } else if (m.media.type === 'video') {
            mediaHtml = `<video src="${m.media.data}" controls onclick="abrirFullscreen('${m.media.data}', 'video')" style="cursor:pointer;"></video>`;
        } else if (m.media.type === 'audio') {
            mediaHtml = `<audio src="${m.media.data}" controls style="max-width:100%;"></audio>`;
        }
    }

    let textoOriginal = m.text || "";
    let textoHTML = textoOriginal;
    let botaoLerMais = "";
    const LIMITE = 400; 

    if (textoOriginal.length > LIMITE) {
        const resumo = textoOriginal.substring(0, LIMITE);
        textoHTML = `
            <span class="resumo">${resumo}...</span>
            <span class="completo" style="display:none">${textoOriginal}</span>
        `;
        botaoLerMais = `<div class="btn-ler-mais" style="color:#007bff; cursor:pointer; font-weight:bold; font-size:13px; margin-top:5px;">Ler mais</div>`;
    }

    div.innerHTML = `
        <div class="bubble">
            ${mediaHtml}
            <div class="msg-body">${textoHTML}</div>
            ${botaoLerMais}
            <span class="time">${hora}:${min}</span>
        </div>
    `;

    if (botaoLerMais) {
        const btn = div.querySelector(".btn-ler-mais");
        btn.onclick = () => {
            div.querySelector(".resumo").style.display = "none";
            div.querySelector(".completo").style.display = "inline";
            btn.remove();
        };
    }

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
    
    document.getElementById("messages").innerHTML = "";
    loadMessages();
}

function voltar() {
    document.getElementById("chatScreen").style.display = "none";
    document.getElementById("home").style.display = "block";
    currentChat = null;
    cancelarEnvioMedia();
    renderContacts();
}

document.getElementById("sendMessageBtn").onclick = async () => {
    const input = document.getElementById("messageText");
    const text = input.value.trim();
    
    if((!text && !mediaParaEnviar) || !currentChat) return;
    
    const payload = { 
        fromId: currentUser.id, 
        toId: currentChat.id, 
        text: text,
        media: mediaParaEnviar 
    };

    input.value = "";
    audioBtn.style.display = "flex";
    sendTextBtn.style.display = "none";
    cancelarEnvioMedia(); 
    
    await fetch("/sendMessage", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
    });
    
    await loadMessages();
    const container = document.getElementById("messages");
    container.scrollTop = container.scrollHeight;
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

function abrirFullscreen(src, type) {
    const modal = document.getElementById("fullScreenModal");
    const content = document.getElementById("fullScreenContent");
    
    if (type === 'image') {
        content.innerHTML = `<img src="${src}" style="max-width:100%; max-height:100%; object-fit:contain;">`;
    } else if (type === 'video') {
        content.innerHTML = `<video src="${src}" controls autoplay style="max-width:100%; max-height:100%;"></video>`;
    }
    
    modal.style.display = "flex";
}

function fecharFullscreen() {
    const modal = document.getElementById("fullScreenModal");
    const content = document.getElementById("fullScreenContent");
    content.innerHTML = ""; 
    modal.style.display = "none";
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log(err));
}

let deferredPrompt;
const installBanner = document.getElementById("installBanner");

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!window.matchMedia('(display-mode: standalone)').matches) {
        installBanner.style.display = "block";
    }
});

installBanner.onclick = () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => {
            installBanner.style.display = "none";
            deferredPrompt = null;
        });
    }
};
