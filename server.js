const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

// 🔥 CONFIGURAÇÃO PARA ACEITAR FOTOS PESADAS DO CELULAR (LIMITE DE 10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// ==========================
// Conexão MongoDB
mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZap?retryWrites=true&w=majority")
  .then(() => console.log("Mongo conectado"))
  .catch(err => console.log("Erro Mongo:", err));

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
// Lógica de Status e Atualização em Tempo Real
let usuariosOnline = {}; 

io.on("connection", (socket) => {
    // Registro de entrada
    socket.on("register", (userId) => {
        socket.userId = userId;
        usuariosOnline[userId] = socket.id;
        
        // Avisa todos que você entrou (fica online)
        io.emit("updateStatus", Object.keys(usuariosOnline));
        console.log(`Usuário ${userId} conectou.`);
    });

    // Quando alguém muda o perfil, avisa todos os outros
    socket.on("updateProfileVisual", (dados) => {
        socket.broadcast.emit("userUpdated", dados);
    });

    // 🔥 REGISTRO DE SAÍDA (OFFLINE EM TEMPO REAL)
    socket.on("disconnect", () => {
        if (socket.userId) {
            console.log(`Usuário ${socket.userId} desconectou.`);
            
            // Remove o usuário da lista de online
            delete usuariosOnline[socket.userId];
            
            // Avisa IMEDIATAMENTE todos os outros que ele saiu
            io.emit("updateStatus", Object.keys(usuariosOnline));
        }
    });
});

// ==========================
// Rotas API

// Rota para criar usuário
app.post("/user", async (req, res) => {
    try {
        const { username, photo } = req.body;
        let id;
        while (true) {
            id = Math.floor(1000 + Math.random() * 9000).toString();
            const existe = await User.findOne({ id });
            if (!exists) break;
        }
        const user = new User({ id, username, photo });
        await user.save();
        res.json(user);
    } catch (e) { res.status(500).send(e); }
});

// Rota para salvar perfil
app.post("/saveProfile", async (req, res) => {
    const { id, username, photo } = req.body;
    await User.findOneAndUpdate({ id }, { username, photo }, { upsert: true });
    res.json({ success: true });
});

// Rota para pegar usuário por ID
app.get("/getUser/:id", async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    if (user) res.send(user);
    else res.status(404).send({ error: "Não encontrado" });
});

// Rota para enviar mensagem
app.post("/sendMessage", async (req, res) => {
    const { fromId, toId, text } = req.body;
    const msg = await Message.create({ fromId, toId, text, timestamp: Date.now() });
    res.json({ success: true, msg });
});

// Rota para buscar mensagens
app.get("/getMessages/:id", async (req, res) => {
    const msgs = await Message.find({
        $or: [{ fromId: req.params.id }, { toId: req.params.id }]
    }).sort({ timestamp: 1 });
    res.send(msgs);
});

// 🔥 NOVA ROTA: EXCLUIR MENSAGEM ESPECÍFICA
app.delete("/deleteMessage/:id", async (req, res) => {
    try {
        const msgId = req.params.id;
        // Tenta remover pelo _id do MongoDB
        const result = await Message.findByIdAndDelete(msgId);
        
        if (result) {
            console.log(`Mensagem ${msgId} removida.`);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Mensagem não encontrada" });
        }
    } catch (e) {
        console.error("Erro ao deletar:", e);
        res.status(500).json({ error: "Erro interno no servidor" });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
