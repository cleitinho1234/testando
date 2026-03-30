let currentUser = null;
let currentChat = null;

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = Number(localStorage.getItem("lastTimestamp")) || 0;

let contatoParaExcluir = null;

// =========================
// INICIAR

window.addEventListener("load", async () => {

let savedId = localStorage.getItem("userId");

if (savedId) {
  const res = await fetch(`/getUser/${savedId}`);
  const user = await res.json();

  if (!user.error && user.username) {
    currentUser = user;
  }
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

const savedName = localStorage.getItem("username");
if(savedName){
  currentUser.username = savedName;
}

document.getElementById("username").value = currentUser.username || "";
document.getElementById("userIdDisplay").textContent = currentUser.id;

if(currentUser.photo){
  document.getElementById("profilePreview").src = currentUser.photo;
}

// ADD CONTATO
document.getElementById("addFriendBtn").onclick = async () => {
const id = document.getElementById("addUserId").value.trim();
if(!id) return alert("Digite um ID");
if(id == currentUser.id) return alert("Você não pode adicionar você mesmo");
if(contacts.some(c => c.id == id)) return alert("Contato já existe");

const res = await fetch(`/getUser/${id}`);
const user = await res.json();
if(user.error || !user.username) return alert("Usuário não encontrado");

contacts.unshift(user);
localStorage.setItem("contacts", JSON.stringify(contacts));
renderContacts();
document.getElementById("addUserId").value = "";
};

renderContacts();
atualizarContatos().then(renderContacts);

// --- ATUALIZAÇÃO EM TEMPO REAL ---
setInterval(() => {
  loadMessages();
  enviarSinalOnline(); 
  atualizarContatos().then(() => {
      renderContacts();
      atualizarStatusHeader(); // <-- NOVIDADE: Atualiza o status no topo do chat aberto
  });
}, 1500);

});

async function enviarSinalOnline() {
  if (currentUser && currentUser.id) {
    fetch("/updatePresence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id })
    });
  }
}

// =========================
// PERFIL

document.getElementById("profileForm")?.addEventListener("submit", async (e) => {
e.preventDefault();
const username = document.getElementById("username").value;
const file = document.getElementById("profilePic").files[0];
let photo = currentUser.photo;

if(file){
  const reader = new FileReader();
  reader.onload = async () => {
    photo = reader.result;
    await salvarPerfil(username, photo);
  };
  reader.readAsDataURL(file);
} else {
  await salvarPerfil(username, photo);
}
});

async function salvarPerfil(username, photo){
currentUser.username = username;
currentUser.photo = photo;
localStorage.setItem("username", username);

contacts = contacts.map(c => (c.id === currentUser.id ? {...c, username, photo} : c));
localStorage.setItem("contacts", JSON.stringify(contacts));
renderContacts();

fetch("/saveProfile", {
  method: "POST",
  headers: {"Content-Type":"application/json"},
  body: JSON.stringify({ id: currentUser.id, username, photo })
});
}

// =========================
// CONTATOS

async function atualizarContatos(){
for (let i = 0; i < contacts.length; i++){
  const res = await fetch(`/getUser/${contacts[i].id}`);
  const user = await res.json();
  if(!user.error && user.username){
    contacts[i] = user;
  }
}
localStorage.setItem("contacts", JSON.stringify(contacts));
}

function renderContacts(){
const div = document.getElementById("contacts");
let html = "";

for (let user of contacts){
const count = unreadCounts[user.id] || 0;
const isOnline = user.lastSeen && (Date.now() - user.lastSeen < 30000);
const statusLabel = isOnline ? 
  `<span style="color:#2ecc71; font-size:10px; font-weight:bold;">online</span>` : 
  `<span style="color:gray; font-size:10px;">offline</span>`;

html += `
<div class="contact" data-id="${user.id}" style="display:flex;align-items:center; padding: 10px; cursor:pointer;">
<img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}"
style="width:35px;height:35px;border-radius:50%;margin-right:10px; border: 2px solid ${isOnline ? '#2ecc71' : 'transparent'}">
<div style="flex:1;">
  <span style="display:block; font-weight:500;">${user.username}</span>
  ${statusLabel}
</div>
${count > 0 ? `<span style="background:red;color:white;border-radius:50%;padding:2px 8px;font-size:12px;margin-left:auto;">${count}</span>` : ""}
</div>
`;
}
div.innerHTML = html;

document.querySelectorAll(".contact").forEach(el => {
let pressTimer;
el.addEventListener("mousedown", () => pressTimer = setTimeout(() => deletarContato(el.dataset.id), 1200));
el.addEventListener("mouseup", () => clearTimeout(pressTimer));
el.addEventListener("touchstart", () => pressTimer = setTimeout(() => deletarContato(el.dataset.id), 1200));
el.addEventListener("touchend", () => clearTimeout(pressTimer));
el.onclick = () => abrirChat(contacts.find(c => c.id == el.dataset.id));
});
}

// =========================
// CHAT (MODIFICADO PARA STATUS NO TOPO)

function abrirChat(user){
currentChat = user;
unreadCounts[user.id] = 0;
localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));

renderContacts();
atualizarStatusHeader(); // <-- Chama a atualização do topo imediatamente

document.getElementById("messages").innerHTML = "";
document.getElementById("home").style.display = "none";
document.getElementById("chatScreen").style.display = "flex";

loadMessages();
}

// NOVA FUNÇÃO: Atualiza o nome e o status no topo da conversa
function atualizarStatusHeader() {
  if (!currentChat) return;

  // Busca os dados atualizados do contato que está na lista de contatos
  const user = contacts.find(c => c.id === currentChat.id);
  if (!user) return;

  const isOnline = user.lastSeen && (Date.now() - user.lastSeen < 30000);
  const statusHtml = isOnline ? 
    `<span style="color:#2ecc71; font-size:12px; font-weight:bold;">online</span>` : 
    `<span style="color:#aaa; font-size:12px;">visto por último há pouco</span>`;

  // Aqui eu assumo que você tem um elemento para o nome e talvez queira um para o status
  // Se o seu HTML só tiver o id="chatName", vamos colocar tudo lá:
  document.getElementById("chatName").innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center;">
        <span>${user.username}</span>
        ${statusHtml}
    </div>
  `;
}

function voltar(){
document.getElementById("chatScreen").style.display = "none";
document.getElementById("home").style.display = "block";
currentChat = null;
}

// =========================
// MODAL EXCLUIR, ENVIAR, LOAD, MENSAGEM (RESTANTE DO CÓDIGO)

function deletarContato(id){
  contatoParaExcluir = id;
  document.getElementById("confirmModal").style.display = "flex";
}

document.getElementById("confirmYes").onclick = () => {
if(!contatoParaExcluir) return;
contacts = contacts.filter(c => c.id != contatoParaExcluir);
delete unreadCounts[contatoParaExcluir];
localStorage.setItem("contacts", JSON.stringify(contacts));
localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
contatoParaExcluir = null;
document.getElementById("confirmModal").style.display = "none";
renderContacts();
};

document.getElementById("confirmNo").onclick = () => {
contatoParaExcluir = null;
document.getElementById("confirmModal").style.display = "none";
};

document.getElementById("sendMessageBtn").onclick = () => {
const input = document.getElementById("messageText");
const text = input.value.trim();
if(!text || !currentChat) return;
input.value = "";
const timestamp = Date.now();
const msg = { fromId: currentUser.id, toId: currentChat.id, text, timestamp };
addMessage(msg);
lastTimestamp = timestamp;
localStorage.setItem("lastTimestamp", lastTimestamp);
fetch("/sendMessage", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(msg) });
};

async function loadMessages(){
const res = await fetch(`/getMessages/${currentUser.id}`);
const msgs = await res.json();
for (let m of msgs){
if(m.timestamp <= lastTimestamp) continue;
lastTimestamp = m.timestamp;
if(m.toId == currentUser.id){
  if(!contacts.some(c => c.id == m.fromId)){
    const resUser = await fetch(`/getUser/${m.fromId}`);
    const newUser = await resUser.json();
    if(!newUser.error) contacts.unshift(newUser);
  }
  const index = contacts.findIndex(c => c.id == m.fromId);
  if(index !== -1){
    const user = contacts.splice(index, 1)[0];
    contacts.unshift(user);
  }
  if(currentChat?.id !== m.fromId){
    unreadCounts[m.fromId] = (unreadCounts[m.fromId] || 0) + 1;
  }
}
}
localStorage.setItem("contacts", JSON.stringify(contacts));
localStorage.setItem("lastTimestamp", lastTimestamp);
localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
renderContacts();
if(!currentChat) return;
const filtered = msgs.filter(m => (m.fromId == currentUser.id && m.toId == currentChat.id) || (m.fromId == currentChat.id && m.toId == currentUser.id));
const container = document.getElementById("messages");
container.innerHTML = "";
for (let m of filtered){ addMessage(m); }
container.scrollTop = container.scrollHeight;
}

function addMessage(m){
const container = document.getElementById("messages");
const div = document.createElement("div");
div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");
const bubble = document.createElement("div");
bubble.className = "bubble";
const text = document.createElement("div");
text.textContent = m.text;
const time = document.createElement("div");
time.style.fontSize = "10px";
time.style.opacity = "0.6";
time.style.textAlign = "right";
if(m.timestamp){
const date = new Date(m.timestamp);
const h = String(date.getHours()).padStart(2,"0");
const min = String(date.getMinutes()).padStart(2,"0");
time.textContent = `${h}:${min}`;
}
bubble.appendChild(text);
bubble.appendChild(time);
div.appendChild(bubble);
container.appendChild(div);
}
