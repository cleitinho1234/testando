const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, "public")));

mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZap?retryWrites=true&w=majority")
  .then(() => console.log("Mongo conectado"))
  .catch(err => console.error("Erro no Mongo:", err));

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

app.post("/updatePresence", async (req, res) => {
    try {
        await User.findOneAndUpdate({ id: req.body.userId }, { lastSeen: Date.now() });
        res.sendStatus(200);
    } catch (e) { res.status(500).send(e); }
});

app.post("/user", async (req, res) => {
    try {
        const { username, photo } = req.body;
        let id;
        while (true) {
            id = Math.floor(1000 + Math.random() * 9000).toString();
            if (!(await User.findOne({ id }))) break;
        }
        const user = new User({ id, username, photo, lastSeen: Date.now() });
        await user.save();
        res.json(user);
    } catch (e) { res.status(500).send(e); }
});

app.post("/saveProfile", async (req, res) => {
    try {
        const { id, username, photo } = req.body;
        await User.findOneAndUpdate({ id }, { username, photo, lastSeen: Date.now() }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).send(e); }
});

app.get("/getUser/:id", async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    if (user) res.json(user);
    else res.status(404).json({ error: "Não encontrado" });
});

app.post("/sendMessage", async (req, res) => {
    try {
        const msg = await Message.create({ ...req.body, timestamp: Date.now() });
        res.json(msg);
    } catch (e) { res.status(500).send(e); }
});

app.get("/getMessages/:id", async (req, res) => {
    const msgs = await Message.find({ $or: [{ fromId: req.params.id }, { toId: req.params.id }] }).sort({ timestamp: 1 });
    res.json(msgs);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor na porta ${PORT}`));
