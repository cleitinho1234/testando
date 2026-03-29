let currentUser = null;
let currentChat = null;

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastTimestamp = localStorage.getItem("lastTimestamp") || 0;

// ✍️ DIGITANDO
let typingTimeout = null;

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

document.getElementById("userIdDisplay").textContent = currentUser.id;

// nome salvo
const savedName = localStorage.getItem("username");
if(savedName){
  currentUser.username = savedName;
}

// mostrar contatos instantâneo
renderContacts();

// atualizar em background
atualizarContatos().then(renderContacts);

// tempo real
setInterval(loadMessages, 1500);

});

// =========================
// DIGITANDO DETECÇÃO

const inputMsg = document.getElementById("messageText");

inputMsg.addEventListener("input", () => {

if(!currentChat) return;

// enviando status digitando
fetch("/typing", {
  method: "POST",
  headers: {"Content-Type":"application/json"},
  body: JSON.stringify({
    fromId: currentUser.id,
    toId: currentChat.id,
    typing: true
  })
});

// parar depois de 1s
clearTimeout(typingTimeout);

typingTimeout = setTimeout(() => {
  fetch("/typing", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      fromId: currentUser.id,
      toId: currentChat.id,
      typing: false
    })
  });
}, 1000);

});

// =========================
// CONTATOS

async function atualizarContatos(){
for (let i = 0; i < contacts.length; i++){
  const res = await fetch(`/getUser/${contacts[i].id}`);
  const user = await res.json();
  if(!user.error) contacts[i] = user;
}
localStorage.setItem("contacts", JSON.stringify(contacts));
}

async function renderContacts(){

const div = document.getElementById("contacts");

let html = "";

for (let user of contacts){

const count = unreadCounts[user.id] || 0;

html += `
<div class="contact" data-id="${user.id}" style="display:flex;align-items:center;">
<img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}"
style="width:30px;height:30px;border-radius:50%;margin-right:10px;">
<span style="flex:1;">${user.username}</span>
${count > 0 ? `<span style="background:red;color:white;border-radius:50%;padding:5px 10px;font-size:12px;">${count}</span>` : ""}
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

}

// =========================
// ABRIR CHAT

function abrirChat(user){

currentChat = user;

unreadCounts[user.id] = 0;
localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));

renderContacts();

document.getElementById("home").style.display = "none";
document.getElementById("chatScreen").style.display = "flex";

document.getElementById("chatName").textContent = user.username;

loadMessages(true);

}

// =========================
// ENVIAR

document.getElementById("sendMessageBtn").onclick = () => {

const input = document.getElementById("messageText");
const text = input.value;

if(!text || !currentChat) return;

input.value = "";

addMessage({
  fromId: currentUser.id,
  text,
  timestamp: Date.now()
});

fetch("/sendMessage", {
method: "POST",
headers: {"Content-Type":"application/json"},
body: JSON.stringify({
  fromId: currentUser.id,
  toId: currentChat.id,
  text,
  timestamp: Date.now()
})
});

};

// =========================
// LOAD MESSAGES

async function loadMessages(){

const res = await fetch(`/getMessages/${currentUser.id}`);
const msgs = await res.json();

for (let m of msgs){

if(m.timestamp <= lastTimestamp) continue;

if(m.timestamp > lastTimestamp){
  lastTimestamp = m.timestamp;
}

if(m.toId == currentUser.id){

  // sobe pro topo
  const index = contacts.findIndex(c => c.id == m.fromId);
  if(index !== -1){
    const user = contacts.splice(index, 1)[0];
    contacts.unshift(user);
  }

  if(currentChat?.id !== m.fromId){
    unreadCounts[m.fromId] = (unreadCounts[m.fromId] || 0) + 1;
  }

}

// auto contato
if(m.toId == currentUser.id && m.fromId != currentUser.id){
  if(!contacts.some(c => c.id == m.fromId)){
    const resUser = await fetch(`/getUser/${m.fromId}`);
    const newUser = await resUser.json();
    if(!newUser.error) contacts.unshift(newUser);
  }
}

}

localStorage.setItem("lastTimestamp", lastTimestamp);
localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));

renderContacts();

// CHAT

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

// =========================
// ✍️ DIGITANDO STATUS

const resTyping = await fetch(`/typing/${currentUser.id}`);
const typingData = await resTyping.json();

const statusDiv = document.getElementById("typingStatus");

if(typingData[currentChat.id]){
statusDiv.textContent = "digitando...";
} else {
statusDiv.textContent = "";
}

}

// =========================
// MENSAGEM COM HORÁRIO

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
