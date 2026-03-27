let currentUser = null;
const contacts = [];

// =========================
// Carregar ou criar usuário
window.addEventListener("load", async () => {
  let savedId = localStorage.getItem("userId");

  if (savedId) {
    const res = await fetch(`/getUser/${savedId}`);
    const user = await res.json();

    if (!user.error) {
      currentUser = user;
    } else {
      localStorage.removeItem("userId");
    }
  }

  if (!currentUser) {
    const res = await fetch("/user", { method: "POST" });
    currentUser = await res.json();
    localStorage.setItem("userId", currentUser.id);
  }

  document.getElementById("userIdDisplay").textContent = currentUser.id;
  document.getElementById("username").value = currentUser.username || "";
  document.getElementById("profilePreview").src = currentUser.photo || "";

  loadMessages();
});

// =========================
// Salvar perfil
document.getElementById("profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const file = document.getElementById("profilePic").files[0];

  let photo = currentUser.photo;

  if (file) {
    const reader = new FileReader();

    reader.onload = async () => {
      photo = reader.result;

      // mostra na hora
      document.getElementById("profilePreview").src = photo;

      await saveProfile(username, photo);
    };

    reader.readAsDataURL(file);
  } else {
    await saveProfile(username, photo);
  }
});

async function saveProfile(username, photo) {
  const res = await fetch("/saveProfile", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      id: currentUser.id,
      username,
      photo
    })
  });

  const updatedUser = await res.json();
  currentUser = updatedUser;

  document.getElementById("username").value = currentUser.username || "";
  document.getElementById("profilePreview").src = currentUser.photo || "";
}

// =========================
// Copiar ID
document.getElementById("copyIdBtn").addEventListener("click", () => {
  navigator.clipboard.writeText(currentUser.id);
  alert("ID copiado!");
});

// =========================
// Enviar mensagem
document.getElementById("sendMessageBtn").addEventListener("click", async () => {
  const toId = document.getElementById("friendSelect").value;
  const text = document.getElementById("messageText").value.trim();

  if (!toId || !text) return alert("Preencha tudo");

  await fetch("/sendMessage", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      fromId: currentUser.id,
      toId,
      text
    })
  });

  document.getElementById("messageText").value = "";
  loadMessages();
});

// =========================
// 🔥 CARREGAR MENSAGENS COM FOTO
async function loadMessages() {
  if (!currentUser) return;

  const res = await fetch(`/getMessages/${currentUser.id}`);
  const msgs = await res.json();

  const messagesDiv = document.getElementById("messages");
  messagesDiv.innerHTML = "";

  for (let m of msgs) {

    // 🔥 busca usuário da mensagem
    const resUser = await fetch(`/getUser/${m.fromId}`);
    const user = await resUser.json();

    const div = document.createElement("div");

    // estilo tipo chat
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.marginBottom = "8px";

    // FOTO
    const img = document.createElement("img");
    img.src = user.photo || "";
    img.style.width = "35px";
    img.style.height = "35px";
    img.style.borderRadius = "50%";
    img.style.marginRight = "10px";

    // TEXTO
    const span = document.createElement("span");

    const nome = m.fromId === currentUser.id
      ? "Você"
      : user.username || m.fromId;

    span.textContent = `${nome}: ${m.text}`;

    div.appendChild(img);
    div.appendChild(span);

    messagesDiv.appendChild(div);
  }

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Atualiza mensagens
setInterval(loadMessages, 3000);
