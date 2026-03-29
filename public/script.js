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

// nome fixo
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

if(user.error || !user.username){
  return alert("Usuário não encontrado");
}

contacts.unshift(user);
localStorage.setItem("contacts", JSON.stringify(contacts));

renderContacts();
document.getElementById("addUserId").value = "";

};

renderContacts();
atualizarContatos().then(renderContacts);

setInterval(loadMessages, 1500);

});

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

contacts = contacts.map(c => {
  if(c.id === currentUser.id){
    return {...c, username, photo};
  }
  return c;
});

localStorage.setItem("contacts", JSON.stringify(contacts));

renderContacts();

fetch("/saveProfile", {
  method: "POST",
  headers: {"Content-Type":"application/json"},
  body: JSON.stringify({
    id: currentUser.id,
    username,
    photo
  })
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

html += `
<div class="contact" data-id="${user.id}" style="display:flex;align-items:center;">
<img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}"
style="width:30px;height:30px;border-radius:50%;margin-right:10px;">
<span style="flex:1;">${user.username}</span>
${count > 0 ? `<span style="background:red;color:white;border-radius:50%;padding:5px 10px;font-size:12px;margin-left:auto;">${count}</span>` : ""}
</div>
`;
}

div.innerHTML = html;

document.querySelectorAll(".contact").forEach(el => {

let pressTimer;

// SEGURAR MAIS TEMPO
el.addEventListener("mousedown", () => {
  pressTimer = setTimeout(() => deletarContato(el.dataset.id), 1200);
});
el.addEventListener("mouseup", () => clearTimeout(pressTimer));

el.addEventListener("touchstart", () => {
  pressTimer = setTimeout(() => deletarContato(el.dataset.id), 1200);
});
el.addEventListener("touchend", () => clearTimeout(pressTimer));

// clique normal
el.onclick = () => {
  const user = contacts.find(c => c.id == el.dataset.id);
  abrirChat(user);
};

});

}

// =========================
// MODAL EXCLUIR

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

// =========================
// CHAT

function abrirChat(user){

currentChat = user;

unreadCounts[user.id] = 0;
localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));

renderContacts();

document.getElementById("messages").innerHTML = "";

document.getElementById("home").style.display = "none";
document.getElementById("chatScreen").style.display = "flex";

document.getElementById("chatName").textContent = user.username;

loadMessages();

}

function voltar(){
document.getElementById("chatScreen").style.display = "none";
document.getElementById("home").style.display = "block";
currentChat = null;
}

// =========================
// ENVIAR

document.getElementById("sendMessageBtn").onclick = () => {

const input = document.getElementById("messageText");
const text = input.value.trim();

if(!text || !currentChat) return;

input.value = "";

const timestamp = Date.now();

const msg = {
  fromId: currentUser.id,
  toId: currentChat.id,
  text,
  timestamp
};

// mostra instantâneo
addMessage(msg);

lastTimestamp = timestamp;
localStorage.setItem("lastTimestamp", lastTimestamp);

fetch("/sendMessage", {
method: "POST",
headers: {"Content-Type":"application/json"},
body: JSON.stringify(msg)
});

};

// =========================
// LOAD

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

const filtered = msgs.filter(m =>
(m.fromId == currentUser.id && m.toId == currentChat.id) ||
(m.fromId == currentChat.id && m.toId == currentUser.id)
);

const container = document.getElementById("messages");

container.innerHTML = "";

for (let m of filtered){
  addMessage(m);
}

container.scrollTop = container.scrollHeight;

}

// =========================
// MENSAGEM

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
