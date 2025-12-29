import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const httpServer = createServer(app);
// Giúp giữ session/rooms, và thường giữ socket.id nếu recover thành công)
const io = new Server(httpServer, {
  connectionStateRecovery: {
    maxDisconnectionDuration: 60 * 60 * 60 * 1000, 
    skipMiddlewares: true
  }
});

// Serve file client
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});                                                             

const online = new Map(); // Map<string, Set<string>>

function addOnline(username, socketId) {
  if (!online.has(username)) online.set(username, new Set());
  online.get(username).add(socketId);
}
function removeOnline(username, socketId) {
  const set = online.get(username);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) online.delete(username);
}
function onlineList() {
  return [...online.keys()].sort();
}

// Middleware lấy username từ handshake
io.use((socket, next) => {
  const username = socket.handshake.auth?.username;
  if (!username || typeof username !== "string") {
    return next(new Error("USERNAME_REQUIRED"));
  }
  socket.data.username = username.trim();
  next();                                                     
});

io.on("connection", (socket) => {
  const username = socket.data.username;
  console.log(`${username} connected`);

  // join room riêng của user
  socket.join(`user:${username}`);
  addOnline(username, socket.id);

  // gửi cho user mới biết trạng thái
  socket.emit("me", {
    username,
    socketId: socket.id,
    recover: socket.recovered
  });

  io.emit("users:list", onlineList());

  // private message: gửi tới room của người nhận
  socket.on("private:message", ({ to, content }, ack) => {
    const msg = (content ?? "").toString().trim();
    const target = (to ?? "").toString().trim();

    if (!target || !msg) {
      ack?.({ ok: false, error: "INVALID_PAYLOAD" });
      return;
    }
    if (!online.has(target)) {
      ack?.({ ok: false, error: "USER_OFFLINE" });
      return;
    }

    const payload = {
      from: username,
      to: target,  
      content: msg,
      ts: Date.now()
    };

    // gửi cho người nhận
    io.to(`user:${target}`).emit("private:message", payload);
    socket.emit("private:message", payload);
    ack?.({ ok: true });
  });

  socket.on("disconnect", () => {
    removeOnline(username, socket.id);
    io.emit("users:list", onlineList());
    // console.log(`${username} disconnected`);
  });
});

httpServer.listen(3000, () => {
  console.log("http://localhost:3000");
});
