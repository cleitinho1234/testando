let currentUser = null;

let currentChat = null;

let lastMessageId = null;

const contacts = JSON.parse(localStorage.getItem("contacts")) || [];

let newUsers = JSON.parse(localStorage.getItem("newUsers")) || [];

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

// CONTATOS (COM NOVO USUÁRIO 🟢)

async function renderContacts(){

const div = document.getElementById("contacts");

div.innerHTML = "";

for (let i = 0; i < contacts.length; i++) {

const res = await fetch(`/getUser/${contacts[i].id}`);

const user = await res.json();



if(!user.error) contacts[i] = user;



const isNew = newUsers.includes(user.id);



const el = document.createElement("div");

el.className = "contact";



el.innerHTML = `

  <img src="${user.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}"

       style="width:30px;height:30px;border-radius:50%;margin-right:10px;">

  <span>${user.username}</span>

  ${isNew ? `<span style="margin-left:auto;width:10px;height:10px;background:green;border-radius:50%;"></span>` : ""}

`;



el.style.display = "flex";

el.style.alignItems = "center";



el.style.userSelect = "none";

el.style.webkitUserSelect = "none";

el.style.webkitTapHighlightColor = "transparent";



el.onclick = () => abrirChat(user);



div.appendChild(el);

}

localStorage.setItem("contacts", JSON.stringify(contacts));

}

// =========================

// ABRIR CHAT

async function abrirChat(user){

const res = await fetch(/getUser/${user.id});

const updatedUser = await res.json();

if(!updatedUser.error) user = updatedUser;

currentChat = user;

document.getElementById("home").style.display = "none";

document.getElementById("chatScreen").style.display = "flex";

document.getElementById("chatName").textContent = user.username;

document.getElementById("chatAvatar").src =

user.photo || "https://cdn-icons-png.flaticon.com/512/149/149071.png";

// 🔥 REMOVE BOLINHA VERDE

newUsers = newUsers.filter(id => id != user.id);

localStorage.setItem("newUsers", JSON.stringify(newUsers));

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

// ADICIONAR CONTATO

document.getElementById("addFriendBtn").onclick = async () => {

const id = document.getElementById("addUserId").value;

const res = await fetch(/getUser/${id});

const user = await res.json();

if(user.error) return alert("Não encontrado");

if(!contacts.some(c => c.id == user.id)){

contacts.push(user);

localStorage.setItem("contacts", JSON.stringify(contacts));

renderContacts();

}

};

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

  text

})

});

document.getElementById("messageText").value = "";

addMessage({

fromId: currentUser.id,

text

}, currentUser);

};

// =========================

// ADICIONAR MENSAGEM

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

// LOAD MESSAGES

async function loadMessages(initial = false){

if(!currentChat) return;

const res = await fetch(/getMessages/${currentUser.id});

const msgs = await res.json();

// 🔥 DETECTA USUÁRIOS NOVOS

for (let m of msgs){

if(m.toId == currentUser.id){

  if(!contacts.some(c => c.id == m.fromId)){

    const resUser = await fetch(`/getUser/${m.fromId}`);

    const user = await resUser.json();

    if(!user.error){

      contacts.push(user);

      localStorage.setItem("contacts", JSON.stringify(contacts));

      if(!newUsers.includes(user.id)){

        newUsers.push(user.id);

        localStorage.setItem("newUsers", JSON.stringify(newUsers));

      }

      renderContacts();

    }

  }

}

}

const filtered = msgs.filter(m =>

(m.fromId == currentUser.id && m.toId == currentChat.id) ||

(m.fromId == currentChat.id && m.toId == currentUser.id)

);

const usersCache = {};

for (let m of filtered){

if(!usersCache[m.fromId]){

  const resUser = await fetch(`/getUser/${m.fromId}`);

  usersCache[m.fromId] = await resUser.json();

}

}

if(initial){

const container = document.getElementById("messages");

container.innerHTML = "";

let html = "";

for (let m of filtered){

  const user = usersCache[m.fromId];

  const isMe = m.fromId == currentUser.id;

  html += `
    <div class="message ${isMe ? "me" : "other"}">
      ${!isMe ? `<img class="avatar" src="${user?.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}">` : ""}
      <div class="bubble">${m.text}</div>
      ${isMe ? `<img class="avatar" src="${user?.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}">` : ""}
    </div>
  `;
}

container.innerHTML = html;

if(filtered.length){

  lastMessageId = filtered[filtered.length - 1].id;

}

container.scrollTop = container.scrollHeight;

}

}

// =========================

setInterval(() => {

loadMessages(false);

}, 2000);
