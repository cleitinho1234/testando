const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
// Aumentado para 50mb para evitar erro de "Payload Too Large" com fotos
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Conexão MongoDB
mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZap?retryWrites=true&w=majority")
  .then(() => console.log("Mongo conectado"))
  .catch(err => console.log("Erro Mongo:", err));

const User = mongoose.model("User", {
    id: String,
    username: String,
    photo: String,
    lastSeen: Number 
});

const Message = mongoose.model("Message", {
    fromId: String,
    toId: String,
    text: String,
    timestamp: Number
});

// Usuários Fixos
const usuariosFixos = [
    { id: "1001", username: "Cleitinho", photo: "" },
    { id: "1002", username: "Tommy", photo: "" },
    { id: "1003", username: "Luffy", photo: "" },
    { id: "1004", username: "Zoro", photo: "" },
    { id: "1005", username: "Nami", photo: "" },
    { id: "1006", username: "Sanji", photo: "" },
    { id: "1007", username: "Usopp", photo: "" },
    { id: "1008", username: "Chopper", photo: "" },
    { id: "1009", username: "Robin", photo: "" },
    { id: "1010", username: "Franky", photo: "" },
];

async function criarUsuariosFixos() {
    for (let u of usuariosFixos) {
        const existe = await User.findOne({ id: u.id });
        if (!existe) await new User({ ...u, lastSeen: Date.now() }).save();
    }
}
criarUsuariosFixos();

app.post("/updatePresence", async (req, res) => {
    const { userId } = req.body;
    await User.findOneAndUpdate({ id: userId }, { lastSeen: Date.now() });
    res.sendStatus(200);
});

app.post("/user", async (req, res) => {
    const { username, photo } = req.body;
    let id;
    while (true) {
        id = Math.floor(1000 + Math.random() * 9000).toString();
        if (!(await User.findOne({ id }))) break;
    }
    const user = new User({ id, username, photo, lastSeen: Date.now() });
    await user.save();
    res.json(user);
});

app.post("/saveProfile", async (req, res) => {
    const { id, username, photo } = req.body;
    await User.findOneAndUpdate({ id }, { username, photo, lastSeen: Date.now() }, { upsert: true });
    res.send({ success: true });
});

app.get("/getUser/:id", async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    if (user) res.send(user);
    else res.status(404).send({ error: "Não encontrado" });
});

app.post("/sendMessage", async (req, res) => {
    const { fromId, toId, text } = req.body;
    const msg = await Message.create({ fromId, toId, text, timestamp: Date.now() });
    res.json({ success: true, msg });
});

app.get("/getMessages/:id", async (req, res) => {
    const msgs = await Message.find({ $or: [{ fromId: req.params.id }, { toId: req.params.id }] }).sort({ timestamp: 1 });
    res.send(msgs);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Rodando na porta ${PORT}`));
