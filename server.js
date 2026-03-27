const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ==========================
// Conexão MongoDB
mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZap?retryWrites=true&w=majority")
  .then(() => console.log("Mongo conectado"))
  .catch(err => console.log(err));

// ==========================
// Modelos
const User = mongoose.model("User", {
    id: String,
    username: String,
    photo: String
});

const Message = mongoose.model("Message", {
    fromId: String,
    toId: String,
    text: String,
    timestamp: Number
});

// ==========================
// Criar novo usuário com ID único
app.post("/user", async (req, res) => {
    const { username, photo } = req.body;

    let id;
    while (true) {
        id = Math.floor(1000 + Math.random() * 9000).toString(); // ID 4 dígitos
        const existe = await User.findOne({ id });
        if (!existe) break;
    }

    const user = new User({ id, username, photo });
    await user.save(); // salva no MongoDB
    res.json(user);
});

// ==========================
// Atualizar perfil
app.post("/saveProfile", async (req, res) => {
    const { id, username, photo } = req.body;

    await User.findOneAndUpdate(
        { id },
        { username, photo },
        { upsert: true }
    );

    res.send({ success: true });
});

// ==========================
// Buscar usuário por ID
app.get("/getUser/:id", async (req, res) => {
    const user = await User.findOne({ id: req.params.id });

    if (user) res.send(user);
    else res.status(404).send({ error: "Usuário não encontrado" });
});

// ==========================
// Enviar mensagem
app.post("/sendMessage", async (req, res) => {
    const { fromId, toId, text } = req.body;

    const remetente = await User.findOne({ id: fromId });
    const destinatario = await User.findOne({ id: toId });
    if (!remetente || !destinatario)
        return res.status(404).json({ error: "ID não encontrado" });

    const msg = await Message.create({
        fromId,
        toId,
        text,
        timestamp: Date.now()
    });

    res.json({ success: true, msg });
});

// ==========================
// Buscar mensagens de/para um usuário
app.get("/getMessages/:id", async (req, res) => {
    const id = req.params.id;

    const msgs = await Message.find({
        $or: [
            { fromId: id },
            { toId: id }
        ]
    }).sort({ timestamp: 1 });

    res.send(msgs);
});

// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
