const express = require("express");
const app = express();

app.use(express.json());

let users = [];
let messages = [];
let onlineUsers = {};

// =========================
// CRIAR USUÁRIO

app.post("/user", (req, res) => {
  const id = Date.now().toString();

  const user = {
    id,
    username: req.body.username,
    photo: req.body.photo
  };

  users.push(user);

  res.json(user);
});

// =========================
// PEGAR USUÁRIO

app.get("/getUser/:id", (req, res) => {
  const id = req.params.id;

  const user = users.find(u => u.id == id);

  if (!user) {
    return res.json({ error: true });
  }

  const lastSeen = onlineUsers[id] || 0;

  res.json({
    ...user,
    lastSeen
  });
});

// =========================
// SALVAR PERFIL

app.post("/saveProfile", (req, res) => {
  const { id, username, photo } = req.body;

  const user = users.find(u => u.id == id);

  if (user) {
    user.username = username;
    user.photo = photo;
  }

  res.json({ ok: true });
});

// =========================
// ONLINE STATUS

app.post("/online", (req, res) => {
  const { id } = req.body;

  if (!id) return res.json({ ok: false });

  onlineUsers[id] = Date.now();

  res.json({ ok: true });
});

// =========================
// MENSAGENS

app.post("/sendMessage", (req, res) => {
  messages.push(req.body);
  res.json({ ok: true });
});

app.get("/getMessages/:id", (req, res) => {
  const id = req.params.id;

  const userMessages = messages.filter(
    m => m.toId == id || m.fromId == id
  );

  res.json(userMessages);
});

// =========================

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
