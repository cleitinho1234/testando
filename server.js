const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Aumentado para 50mb para suportar fotos de perfil em alta qualidade
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static("public"));

// Conexão direta e segura
mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZapV2")
    .then(() => console.log("✅ Banco de Dados conectado!"))
    .catch(err => console.error("❌ Erro ao conectar banco:", err));

// Schemas simplificados
const User = mongoose.model("User", { id: String, username: String, photo: String });
const Message = mongoose.model("Message", { fromId: String, toId: String, text: String, timestamp: Number });
const Moment = mongoose.model("Moment", { userId: String, username: String, userPhoto: String, media: String, timestamp: Number });

let onlineUsers = {};

io.on("connection", (socket) => {
    socket.on("register", (userId) => {
        socket.userId = userId;
        onlineUsers[userId] = socket.id;
        io.emit("updateStatus", Object.keys(onlineUsers));
    });

    // Escuta quando alguém atualiza o perfil e avisa a todos
    socket.on("updateProfileVisual", (dados) => {
        // Envia para todos os usuários conectados a nova foto/nome
        io.emit("userUpdated", dados);
    });

    socket.on("disconnect", () => {
        if (socket.userId) {
            delete onlineUsers[socket.userId];
            io.emit("updateStatus", Object.keys(onlineUsers));
        }
    });
});

// --- ROTAS DE USUÁRIO ---

// Cria novo usuário
app.post("/api/user", async (req, res) => {
    const id = Math.floor(1000 + Math.random() * 9000).toString();
    const user = await User.create({ id, ...req.body });
    res.json(user);
});

// Busca usuário por ID
app.get("/api/user/:id", async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    res.json(user || { error: "Não encontrado" });
});

// ROTA CRUCIAL: Salva as alterações de nome e foto
app.post("/api/saveProfile", async (req, res) => {
    const { id, username, photo } = req.body;
    try {
        const updatedUser = await User.findOneAndUpdate(
            { id: id }, 
            { username, photo }, 
            { new: true }
        );
        if (updatedUser) {
            res.sendStatus(200);
        } else {
            res.status(404).json({ error: "Usuário não encontrado" });
        }
    } catch (err) {
        console.error("Erro ao salvar perfil:", err);
        res.status(500).json({ error: "Erro interno ao salvar" });
    }
});

// --- ROTAS DE MENSAGENS ---

app.post("/api/messages", async (req, res) => {
    const msg = await Message.create({ ...req.body, timestamp: Date.now() });
    res.json(msg);
});

app.get("/api/messages/:id1/:id2", async (req, res) => {
    const { id1, id2 } = req.params;
    const msgs = await Message.find({
        $or: [
            { fromId: id1, toId: id2 },
            { fromId: id2, toId: id1 }
        ]
    }).sort({ timestamp: 1 });
    res.json(msgs);
});

// Porta dinâmica para o Render ou 3000 local
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 MiniZap V2 rodando na porta ${PORT}`));
