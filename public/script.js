let currentUser = null;
let currentChat = null;

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];

// 🔴 CONTROLE
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let processedMessages = JSON.parse(localStorage.getItem("processedMessages")) || {};

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

renderContacts();

// 🔄 tempo real
setInterval(loadMessages, 1500);

});

// =========================
// CONTATOS (INSTANTÂNEO)

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

// clique rápido
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

currentChat = user;

// 🔴 zerar contador
unreadCounts[user.id] = 0;
localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));

renderContacts();

document.getElementById("home").style.display = "none";
document.getElementById("chatScreen").style.display = "flex";

document.getElementById("chatName").textContent = user.username;

await loadMessages(true);

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

const message = {
  id: Date.now(),
  fromId: currentUser.id,
  toId: currentChat.id,
  text,
  timestamp: Date.now()
};

// mostra na hora
addMessage(message);

// envia pro servidor
await fetch("/sendMessage", {
method: "POST",
headers: {"Content-Type":"application/json"},
body: JSON.stringify(message)
});

document.getElementById("messageText").value = "";

};

// =========================
// LOAD MESSAGES

async function loadMessages(initial = false){

const res = await fetch(`/getMessages/${currentUser.id}`);
const msgs = await res.json();

let updatedContacts = false;
let updatedUnread = false;

// 🔥 PROCESSAR MENSAGENS
for (let m of msgs){

// auto contato
if(m.toId == currentUser.id && m.fromId != currentUser.id){

  if(!contacts.some(c => c.id == m.fromId)){
    const resUser = await fetch(`/getUser/${m.fromId}`);
    const newUser = await resUser.json();

    if(!newUser.error){
      contacts.push(newUser);
      updatedContacts = true;
    }
  }

}

// contador
if(m.toId == currentUser.id){

  if(!processedMessages[m.id]){

    processedMessages[m.id] = true;

    if(currentChat?.id !== m.fromId){

      if(!unreadCounts[m.fromId]){
        unreadCounts[m.fromId] = 0;
      }

      unreadCounts[m.fromId]++;
      updatedUnread = true;

    }

  }

}

}

// salvar mudanças
if(updatedContacts){
localStorage.setItem("contacts", JSON.stringify(contacts));
renderContacts();
}

if(updatedUnread){
localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
renderContacts();
}

localStorage.setItem("processedMessages", JSON.stringify(processedMessages));

// =========================
// CHAT

if(!currentChat) return;

const filtered = msgs.filter(m =>
(m.fromId == currentUser.id && m.toId == currentChat.id) ||
(m.fromId == currentChat.id && m.toId == currentUser.id)
);

const container = document.getElementById("messages");

// 🔥 carregamento instantâneo
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

// 🔥 novas mensagens
for (let m of filtered){

if(processedMessages["chat_" + m.id]) continue;

processedMessages["chat_" + m.id] = true;

addMessage(m);

}

container.scrollTop = container.scrollHeight;

}

// =========================
// ADICIONAR MENSAGEM

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
