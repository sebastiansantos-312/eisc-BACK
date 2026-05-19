import { Server, type Socket } from "socket.io";
import "dotenv/config";

const defaultOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
];
const origins = (process.env.ORIGIN ? process.env.ORIGIN.split(",") : defaultOrigins)
  .map(s => s.trim())
  .filter(Boolean);

const io = new Server({
  cors: {
    origin: origins
  }
});

const port = Number(process.env.PORT ?? 3000);

try {
  io.listen(port);
  console.log(`Server is running on port ${port}`);
  }
 catch (error) {
  console.error(error);
}

type OnlineUser = { socketId: string; userId: string };
type ChatMessagePayload = {
  userId: string;
  message: string;
  timestamp?: string;
};
type RoomPayload = {
  roomId?: string;
  userId?: string;
};

let onlineUsers: OnlineUser[] = [];
const roomUsers = new Map<string, OnlineUser[]>();

const emitRoomUsers = (roomId: string) => {
  io.to(roomId).emit("room:users", {
    roomId,
    users: roomUsers.get(roomId) ?? [],
  });
};

io.on("connection", (socket: Socket) => {
  onlineUsers.push({ socketId: socket.id, userId: "" });
  io.emit("usersOnline", onlineUsers);
  console.log(
    "A user connected with id: ",
    socket.id,
    " there are now ",
    onlineUsers.length,
    " online users"
  );

  socket.on("newUser", (userId: string) => {
    if (!userId) {
      return;
    }

    const existingUserIndex = onlineUsers.findIndex(
      user => user.socketId === socket.id
    );

    if (existingUserIndex !== -1) {
      onlineUsers[existingUserIndex] = { socketId: socket.id, userId };
    } else if (!onlineUsers.some(user => user.userId === userId)) {
      onlineUsers.push({ socketId: socket.id, userId });
    } else {
      onlineUsers = onlineUsers.map(user =>
        user.userId === userId ? { socketId: socket.id, userId } : user
      );
    }

    io.emit("usersOnline", onlineUsers);
  });

  socket.on("chat:message", (payload: ChatMessagePayload) => {
    const trimmedMessage = payload?.message?.trim();

    if (!trimmedMessage) {
      return;
    }

    const sender =
      onlineUsers.find(user => user.socketId === socket.id) ?? null;

    const outgoingMessage = {
      userId: payload.userId || sender?.userId || socket.id,
      message: trimmedMessage,
      timestamp: payload.timestamp ?? new Date().toISOString()
    };

    io.emit("chat:message", outgoingMessage);
    console.log(
      "Relayed chat message from: ",
      outgoingMessage.userId,
      " message: ",
      outgoingMessage.message
    );
  });

  socket.on("room:join", (payload: RoomPayload) => {
    const roomId = payload?.roomId?.trim();
    const userId = payload?.userId?.trim();

    if (!roomId || !userId) {
      socket.emit("room:error", { message: "roomId and userId are required." });
      return;
    }

    socket.join(roomId);

    const currentRoomUsers = roomUsers.get(roomId) ?? [];
    const nextRoomUsers = [
      ...currentRoomUsers.filter(user => user.userId !== userId && user.socketId !== socket.id),
      { socketId: socket.id, userId },
    ];

    roomUsers.set(roomId, nextRoomUsers);
    emitRoomUsers(roomId);
    console.log("User joined room:", roomId, "user:", userId);
  });

  socket.on("room:leave", (payload: RoomPayload) => {
    const roomId = payload?.roomId?.trim();

    if (!roomId) {
      return;
    }

    socket.leave(roomId);

    const nextRoomUsers = (roomUsers.get(roomId) ?? []).filter(user => user.socketId !== socket.id);
    roomUsers.set(roomId, nextRoomUsers);
    emitRoomUsers(roomId);
    console.log("User left room:", roomId, "socket:", socket.id);
  });

  socket.on("disconnect", () => {
    onlineUsers = onlineUsers.filter(user => user.socketId !== socket.id);
    for (const [roomId, users] of roomUsers.entries()) {
      const nextRoomUsers = users.filter(user => user.socketId !== socket.id);
      roomUsers.set(roomId, nextRoomUsers);
      emitRoomUsers(roomId);
    }
    io.emit("usersOnline", onlineUsers);
    console.log(
      "A user disconnected with id: ",
      socket.id,
      " there are now ",
      onlineUsers.length,
      " online users"
    );
  });
});
