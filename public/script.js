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

// ✅ CORRIGIDO (SEM ?t=)
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

// continua atualizando para todos verem mudanças
setInterval(() => {
  loadMessages();
  atualizarContatos().then(renderContacts);
}, 1500);

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

// ✅ FUNÇÃO 100% CORRIGIDA
async function salvarPerfil(username, photo){

currentUser.username = username;
currentUser.photo = photo;

localStorage.setItem("username", username);

// ✅ preview imediato (sem bug)
if(photo){
  document.getElementById("profilePreview").src = photo;
}

// ✅ atualizar contatos corretamente
contacts = contacts.map(c => {
  if(c.id === currentUser.id){
    return {
      ...c,
      username: username,
      photo: photo
    };
  }
  return c;
});

localStorage.setItem("contacts", JSON.stringify(contacts));

renderContacts();

// salvar no servidor
await fetch("/saveProfile", {
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

el.addEventListener("mousedown", () => {
  pressTimer = setTimeout(() => deletarContato(el.dataset.id), 1200);
});
el.addEventListener("mouseup", () => clearTimeout(pressTimer));

el.addEventListener("touchstart", () => {
  pressTimer = setTimeout(() => deletarContato(el.dataset.id), 1200);
});
el.addEventListener("touchend", () => clearTimeout(pressTimer));

el.onclick = () => {
  const user = contacts.find(c => c.id == el.dataset.id);
  abrirChat(user);
};

});

}

// =========================
// RESTO DO CÓDIGO (NÃO ALTERADO)
