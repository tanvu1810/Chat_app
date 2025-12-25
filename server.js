import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// ✅ Connection State Recovery (giúp giữ session/rooms, và thường giữ socket.id nếu recover thành công)
const io = new Server(httpServer, {
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 phút
    skipMiddlewares: true
  }
});

// Serve file client
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ---- Online tracking: username -> Set(socketId)
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
  // gắn vào socket.data để dùng sau (và recovery có thể restore data)
  socket.data.username = username.trim();
  next();
});

io.on("connection", (socket) => {
  const username = socket.data.username;

  // ✅ mỗi user join 1 room riêng (inbox room) => route ổn định, multi-tab/multi-device ok
  socket.join(`user:${username}`);

  addOnline(username, socket.id);

  // gửi cho user mới biết trạng thái
  socket.emit("me", {
    username,
    socketId: socket.id,
    recovered: socket.recovered
  });

  // broadcast list online cho tất cả
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
    // echo lại cho người gửi (để UI hiển thị ngay)
    socket.emit("private:message", payload);

    ack?.({ ok: true });
  });

  socket.on("disconnect", () => {
    removeOnline(username, socket.id);
    io.emit("users:list", onlineList());
  });
});

httpServer.listen(3000, () => {
  console.log("http://localhost:3000");
});
