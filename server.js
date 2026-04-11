const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

// 🔥 LIMITES AUMENTADOS PARA FOTOS E PERFIL
app.use(express.json({ limit: '15mb' })); 
app.use(express.urlencoded({ limit: '15mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e7 // 10MB de limite no socket também
});

app.use(express.static(path.join(__dirname, "public")));

// ==========================
// Conexão MongoDB
mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZap?retryWrites=true&w=majority")
  .then(() => console.log("✅ Mongo conectado com sucesso"))
  .catch(err => console.error("❌ Erro ao conectar no Mongo:", err));

// ==========================
// Modelos
const User = mongoose.model("User", {
    id: { type: String, unique: true },
    username: String,
    photo: String
});

const Message = mongoose.model("Message", {
    fromId: String,
    toId: String,
    text: String,
    timestamp: { type: Number, default: Date.now }
});

// ==========================
// Lógica de Status em Tempo Real
let usuariosOnline = {}; 

io.on("connection", (socket) => {
    socket.on("register", (userId) => {
        if(!userId) return;
        socket.userId = userId;
        usuariosOnline[userId] = socket.id;
        
        io.emit("updateStatus", Object.keys(usuariosOnline));
        console.log(`🚀 Usuário ${userId} online.`);
    });

    socket.on("updateProfileVisual", (dados) => {
        // Envia para todos EXCETO para quem enviou
        socket.broadcast.emit("userUpdated", dados);
    });

    socket.on("disconnect", () => {
        if (socket.userId) {
            delete usuariosOnline[socket.userId];
            io.emit("updateStatus", Object.keys(usuariosOnline));
            console.log(`💤 Usuário ${socket.userId} offline.`);
        }
    });
});

// ==========================
// Rotas API com tratamento de erros
app.post("/user", async (req, res) => {
    try {
        const { username, photo } = req.body;
        let id;
        while (true) {
            id = Math.floor(1000 + Math.random() * 9000).toString();
            const existe = await User.findOne({ id });
            if (!existe) break;
        }
        const user = new User({ id, username, photo });
        await user.save();
        res.json(user);
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: "Erro ao criar usuário" }); 
    }
});

app.post("/saveProfile", async (req, res) => {
    try {
        const { id, username, photo } = req.body;
        await User.findOneAndUpdate({ id }, { username, photo }, { upsert: true });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Erro ao salvar perfil" });
    }
});

app.get("/getUser/:id", async (req, res) => {
    try {
        const user = await User.findOne({ id: req.params.id });
        if (user) res.send(user);
        else res.status(404).send({ error: "Não encontrado" });
    } catch (e) {
        res.status(500).send({ error: "Erro no banco" });
    }
});

app.post("/sendMessage", async (req, res) => {
    try {
        const { fromId, toId, text } = req.body;
        if(!text) return res.status(400).send("Texto vazio");
        
        const msg = await Message.create({ fromId, toId, text, timestamp: Date.now() });
        res.json({ success: true, msg });
    } catch (e) {
        res.status(500).send("Erro ao enviar");
    }
});

app.get("/getMessages/:id", async (req, res) => {
    try {
        // Busca mensagens onde o usuário é o remetente OU o destinatário
        const msgs = await Message.find({
            $or: [{ fromId: req.params.id }, { toId: req.params.id }]
        }).sort({ timestamp: 1 }).limit(200); // Limite de 200 mensagens para não travar
        res.send(msgs);
    } catch (e) {
        res.status(500).send([]);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🌍 Servidor em: http://localhost:${PORT}`));
