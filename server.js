const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Aumentado para 50mb para garantir que fotos de perfil e momentos não deem erro
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static("public"));

// Conexão direta e segura
mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZapV2")
    .then(() => console.log("✅ Banco de Dados conectado!"));

// Schemas Atualizados com deviceId
const User = mongoose.model("User", { 
    id: String, 
    username: String, 
    photo: String,
    deviceId: String // Novo campo para persistência
});

const Message = mongoose.model("Message", { fromId: String, toId: String, text: String, timestamp: Number });
const Moment = mongoose.model("Moment", { userId: String, username: String, userPhoto: String, media: String, timestamp: Number });

let onlineUsers = {};

io.on("connection", (socket) => {
    socket.on("register", (userId) => {
        socket.userId = userId;
        onlineUsers[userId] = socket.id;
        io.emit("updateStatus", Object.keys(onlineUsers));
    });

    socket.on("updateProfileVisual", (dados) => {
        io.emit("userUpdated", dados);
    });

    // 🔥 LOGICA DE DIGITANDO: Repassa o evento para o destinatário específico
    socket.on("typing", (data) => {
        if (onlineUsers[data.toId]) {
            io.to(onlineUsers[data.toId]).emit("userTyping", { fromId: data.fromId });
        }
    });

    socket.on("disconnect", () => {
        if (socket.userId) {
            delete onlineUsers[socket.userId];
            io.emit("updateStatus", Object.keys(onlineUsers));
        }
    });
});

// --- ROTAS DE USUÁRIO ---

app.post("/api/user", async (req, res) => {
    try {
        const id = Math.floor(1000 + Math.random() * 9000).toString();
        const user = await User.create({ id, ...req.body });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: "Erro ao criar usuário" });
    }
});

app.get("/api/recover-by-device/:deviceId", async (req, res) => {
    try {
        const user = await User.findOne({ deviceId: req.params.deviceId });
        if (user) {
            res.json(user);
        } else {
            res.status(404).json({ error: "Nenhuma conta vinculada a este dispositivo" });
        }
    } catch (err) {
        res.status(500).json({ error: "Erro na recuperação" });
    }
});

app.post("/api/saveProfile", async (req, res) => {
    const { id, username, photo } = req.body;
    const user = await User.findOneAndUpdate(
        { id: id },
        { username, photo },
        { new: true }
    );
    if (user) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Usuário não encontrado" });
    }
});

app.get("/api/user/:id", async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    res.json(user || { error: "Não encontrado" });
});

// --- ROTA DE MOMENTOS (STATUS) ---

app.post("/api/moments", async (req, res) => {
    try {
        const novoMomento = await Moment.create({
            ...req.body,
            timestamp: Date.now()
        });
        io.emit("newMoment", novoMomento);
        res.json(novoMomento);
    } catch (err) {
        res.status(500).json({ error: "Erro ao postar momento" });
    }
});

app.get("/api/moments", async (req, res) => {
    const umDiaAtras = Date.now() - (24 * 60 * 60 * 1000);
    try {
        const momentos = await Moment.find({ 
            timestamp: { $gt: umDiaAtras } 
        }).sort({ timestamp: -1 });
        res.json(momentos);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar momentos" });
    }
});

// --- LÓGICA DE MENSAGENS ---

app.post("/api/messages", async (req, res) => {
    const { fromId, toId, text } = req.body;
    const msg = await Message.create({ fromId, toId, text, timestamp: Date.now() });

    const sender = await User.findOne({ id: fromId });

    if (onlineUsers[toId]) {
        io.to(onlineUsers[toId]).emit("receiveMessage", {
            msg,
            sender: {
                id: sender.id,
                username: sender.username,
                photo: sender.photo
            }
        });
    }
    res.json(msg);
});

app.get("/api/messages/:id1/:id2", async (req, res) => {
    const msgs = await Message.find({
        $or: [
            { fromId: req.params.id1, toId: req.params.id2 },
            { fromId: req.params.id2, toId: req.params.id1 }
        ]
    }).sort({ timestamp: 1 });
    res.json(msgs);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 MiniZap V2 rodando na porta ${PORT}`));
