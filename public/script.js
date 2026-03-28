let currentUser = null;
let currentChat = null;

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];

// 🔴 CONTADOR
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};

// =========================
// INICIAR

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

// ID
document.getElementById("userIdDisplay").textContent = currentUser.id;

// RESTAURA NOME
const savedName = localStorage.getItem("username");
if(savedName){
  currentUser.username = savedName;
}

// FOTO
if(currentUser.photo){
  document.getElementById("profilePreview").src = currentUser.photo;
}

await renderContacts();

// 🔄 TEMPO REAL
setInterval(loadMessages, 1500);

});

// =========================
// CONTATOS

async function renderContacts(){

const div = document.getElementById("contacts");

let html = "";

for (let i = 0; i < contacts.length; i++) {

const res = await fetch(`/getUser/${contacts[i].id}`);
const user = await res.json();

if(!user.error){
  contacts[i] = user;
}

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
  el.onclick = () => {
    const user = contacts.find(c => c.id == el.dataset.id);
    abrirChat(user);
  };
});

localStorage.setItem("contacts", JSON.stringify(contacts));

}

// =========================
// ABRIR CHAT

async function abrirChat(user){

const res = await fetch(`/getUser/${user.id}`);
const updatedUser = await res.json();

currentChat = !updatedUser.error ? updatedUser : user;

// 🔴 ZERA CONTADOR SÓ DESSE CONTATO
unreadCounts[currentChat.id] = 0;
localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));

await renderContacts();

document.getElementById("home").style.display = "none";
document.getElementById("chatScreen").style.display = "flex";

document.getElementById("chatName").textContent = currentChat.username;

await loadMessages(true);

// 🔥 GARANTE ATUALIZAÇÃO CORRETA
setTimeout(loadMessages, 100);

}

// =========================
// VOLTAR

function voltar(){
document.getElementById("chatScreen").style.display = "none";
document.getElementById("home").style.display = "block";
currentChat = null;
}

// =========================
// ENVIAR

document.getElementById("sendMessageBtn").onclick = async () => {

const text = document.getElementById("messageText").value;
if(!text || !currentChat) return;

// envia pro servidor
await fetch("/sendMessage", {
method: "POST",
headers: {"Content-Type":"application/json"},
body: JSON.stringify({
  fromId: currentUser.id,
  toId: currentChat.id,
  text,
  timestamp: Date.now()
})
});

// mostra na hora
addMessage({
  fromId: currentUser.id,
  text
});

document.getElementById("messageText").value = "";

};

// =========================
// LOAD MESSAGES (CORRIGIDO)

async function loadMessages(initial = false){

const res = await fetch(`/getMessages/${currentUser.id}`);
const msgs = await res.json();

// 🔴 RECONSTRUIR CONTADOR
let newUnread = {};

for (let m of msgs){

// só mensagens recebidas
if(m.toId == currentUser.id){

  if(currentChat?.id !== m.fromId){

    if(!newUnread[m.fromId]){
      newUnread[m.fromId] = 0;
    }

    newUnread[m.fromId]++;
  }

}

// auto contato
if(m.toId == currentUser.id && m.fromId != currentUser.id){

  if(!contacts.some(c => c.id == m.fromId)){

    const resUser = await fetch(`/getUser/${m.fromId}`);
    const newUser = await resUser.json();

    if(!newUser.error){
      contacts.unshift(newUser);
    }

  }

}

}

// 🔥 ATUALIZA SEM QUEBRAR
for (let userId in newUnread){
  unreadCounts[userId] = newUnread[userId];
}

// 🔥 ZERA SÓ QUEM NÃO TEM MENSAGEM
for (let userId in unreadCounts){
  if(!newUnread[userId]){
    unreadCounts[userId] = 0;
  }
}

localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));

await renderContacts();

// =========================
// CHAT

if(!currentChat) return;

const filtered = msgs.filter(m =>
(m.fromId == currentUser.id && m.toId == currentChat.id) ||
(m.fromId == currentChat.id && m.toId == currentUser.id)
);

const container = document.getElementById("messages");

if(initial){

let html = "";

for (let m of filtered){

  const isMe = m.fromId == currentUser.id;

  html += `
    <div class="message ${isMe ? "me" : "other"}">
      <div class="bubble">${m.text}</div>
    </div>
  `;
}

container.innerHTML = html;
container.scrollTop = container.scrollHeight;

return;
}

// atualiza mensagens
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
bubble.textContent = m.text;

div.appendChild(bubble);
container.appendChild(div);

}
