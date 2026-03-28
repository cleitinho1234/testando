let currentUser = null;

let currentChat = null;

let lastMessageId = null;

let contacts = JSON.parse(localStorage.getItem("contacts")) || [];

// 🔴 NOVO
let unreadCounts = JSON.parse(localStorage.getItem("unreadCounts")) || {};
let lastSeenMessages = JSON.parse(localStorage.getItem("lastSeenMessages")) || {};

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

const savedName = localStorage.getItem("username");
if(savedName) currentUser.username = savedName;

if(currentUser.username){
document.getElementById("username").value = currentUser.username;
}

if(currentUser.photo){
document.getElementById("profilePreview").src = currentUser.photo;
}

renderContacts();

});

// =========================

// SALVAR PERFIL

document.getElementById("profileForm").addEventListener("submit", async (e) => {

e.preventDefault();

const username = document.getElementById("username").value;
const file = document.getElementById("profilePic").files[0];

let photo = currentUser.photo;

if(file){
const reader = new FileReader();

reader.onload = async () => {
  photo = reader.result;
  await salvarPerfil(username, photo);
}

reader.readAsDataURL(file);

} else {
await salvarPerfil(username, photo);
}

});

async function salvarPerfil(username, photo){

await fetch("/saveProfile", {
method: "POST",
headers: {"Content-Type":"application/json"},
body: JSON.stringify({ id: currentUser.id, username, photo })
});

localStorage.setItem("username", username);

currentUser.username = username;
currentUser.photo = photo;

document.getElementById("profilePreview").src = photo;

renderContacts();

}

// =========================

// CONTATOS

async function renderContacts(){

const div = document.getElementById("contacts");
div.innerHTML = "";

for (let i = 0; i < contacts.length; i++) {

const res = await fetch(`/getUser/${contacts[i].id}`);
const user = await res.json();

if(!user.error) contacts[i] = user;

const el = document.createElement("div");
el.className = "contact";

const count = unreadCounts[user.id] || 0;

el.innerHTML = `
  <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}"
       style="width:30px;height:30px;border-radius:50%;margin-right:10px;">

  <span style="flex:1;">${user.username}</span>

  ${count > 0 ? `<span style="
    background:red;
    color:white;
    border-radius:50%;
    padding:5px 10px;
    font-size:12px;
    margin-left:auto;
  ">${count}</span>` : ""}
`;

el.style.display = "flex";
el.style.alignItems = "center";

el.onclick = () => abrirChat(user);

div.appendChild(el);

}

localStorage.setItem("contacts", JSON.stringify(contacts));

}

// =========================

// ABRIR CHAT

async function abrirChat(user){

const res = await fetch(`/getUser/${user.id}`);
const updatedUser = await res.json();

if(!updatedUser.error) user = updatedUser;

currentChat = user;

// 🔴 ZERAR CONTADOR
unreadCounts[user.id] = 0;
lastSeenMessages[user.id] = Date.now();

localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
localStorage.setItem("lastSeenMessages", JSON.stringify(lastSeenMessages));

renderContacts();

document.getElementById("home").style.display = "none";
document.getElementById("chatScreen").style.display = "flex";

document.getElementById("chatName").textContent = user.username;

document.getElementById("chatAvatar").src =
user.photo || "https://cdn-icons-png.flaticon.com/512/149/149071.png";

lastMessageId = null;

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

document.getElementById("messageText").value = "";

};

// =========================

// 🔥 LOAD MESSAGES COMPLETO

async function loadMessages(initial = false){

const res = await fetch(`/getMessages/${currentUser.id}`);
const msgs = await res.json();

// 🔥 AUTO CONTATO + CONTADOR
let updated = false;

for (let m of msgs){

// auto contato
if(m.toId == currentUser.id && m.fromId != currentUser.id){

  if(!contacts.some(c => c.id == m.fromId)){

    const resUser = await fetch(`/getUser/${m.fromId}`);
    const newUser = await resUser.json();

    if(!newUser.error){
      contacts.push(newUser);
      updated = true;
    }

  }

}

// 🔴 CONTADOR NÃO LIDAS
if(m.toId == currentUser.id){

  const lastSeen = lastSeenMessages[m.fromId] || 0;

  if(m.timestamp && m.timestamp > lastSeen){

    if(currentChat?.id !== m.fromId){

      if(!unreadCounts[m.fromId]){
        unreadCounts[m.fromId] = 0;
      }

      unreadCounts[m.fromId]++;

    }

  }

}

}

if(updated){
localStorage.setItem("contacts", JSON.stringify(contacts));
renderContacts();
}

localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));

// =========================
// CHAT

if(!currentChat) return;

const filtered = msgs.filter(m =>

(m.fromId == currentUser.id && m.toId == currentChat.id) ||

(m.fromId == currentChat.id && m.toId == currentUser.id)

);

const container = document.getElementById("messages");

if(initial) container.innerHTML = "";

for (let m of filtered){

if(lastMessageId && m.id <= lastMessageId) continue;

const resUser = await fetch(`/getUser/${m.fromId}`);
const user = await resUser.json();

addMessage(m, user);

lastMessageId = m.id;

}

container.scrollTop = container.scrollHeight;

}

// =========================

// MENSAGEM

function addMessage(m, user){

const div = document.createElement("div");

div.className = "message " + (m.fromId == currentUser.id ? "me" : "other");

const img = document.createElement("img");
img.className = "avatar";
img.src = user?.photo || "https://cdn-icons-png.flaticon.com/512/149/149071.png";

const bubble = document.createElement("div");
bubble.className = "bubble";
bubble.textContent = m.text;

if(m.fromId == currentUser.id){
div.appendChild(bubble);
div.appendChild(img);
} else {
div.appendChild(img);
div.appendChild(bubble);
}

document.getElementById("messages").appendChild(div);

}

// =========================

// TEMPO REAL

setInterval(() => {
loadMessages(false);
}, 2000);
