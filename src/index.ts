import "dotenv/config";
import express from "express";
import http from "http";
import { Server, type Socket } from "socket.io";
import { randomUUID } from "crypto";
import { Player } from "./types";
import { FieldParams } from "./enums";
import { checkCell, createCells, createShipTypes } from "./helpers";

const { FIELD_SIZE, FIELD_SIZE_MINUS, FIELD_SIZE_PLUS } = FieldParams;
const PORT = process.env.PORT || 5000;

class NewPlayer implements Player {
  constructor(
    public id: string,
    public ready = false,
    public isOnline = true,
    public field = createCells(),
    public opponentView = createCells(),
    public currentShipType = createShipTypes(),
    public builtDecks = 0
  ) {}
}

class Game {
  players: { [key: string]: Player };
  currentTurnId: string;
  status: "placing" | "playing" | "over";
  winner: string;

  constructor() {
    this.players = {};
    this.currentTurnId = "";
    this.status = "placing";
    this.winner = "";
  }
}

const app = express();
const server = http.createServer(app);

const games: Map<string, Game> = new Map();

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"],
  },
});

function buildShip(clickedId: number, gameId: string, playerId: string) {
  const game = games.get(gameId);

  if (!game) return;

  const currentShip = { ...game.players[playerId].currentShipType.find((item) => item.isBuilding) };
  const shipId = Number(String(currentShip?.decks) + String(currentShip?.leftToBuild));
  const builtDecks = game.players[playerId].builtDecks;

  if (currentShip?.leftToBuild && checkCell(clickedId, shipId, builtDecks, game.players[playerId].field)) {
    game.players[playerId].field[clickedId].shipId = shipId;
    const newBuiltDecks = builtDecks + 1;

    game.players[playerId].currentShipType.forEach((item) => {
      item.leftToBuild =
        currentShip.decks === item.decks ? (newBuiltDecks === currentShip.decks ? item.leftToBuild - 1 : item.leftToBuild) : item.leftToBuild;
      item.isBuilding =
        currentShip.leftToBuild === 1 && newBuiltDecks === currentShip.decks
          ? item.decks === currentShip.decks + 1
            ? true
            : false
          : item.isBuilding;
    });

    game.players[playerId].builtDecks = newBuiltDecks === (currentShip.decks ?? 1) ? 0 : newBuiltDecks;

    game.players[playerId].ready = !game.players[playerId].currentShipType.some((item) => item.isBuilding);

    const playersIds = Object.keys(game.players);

    if (playersIds.length === 2 && Object.values(game.players).every((item) => item.ready)) {
      game.status = "playing";
      game.currentTurnId = playersIds[Math.round(Math.random())];
    }

    return true;
  }

  return;
}

function makeStrike(clickedId: number, gameId: string, opponentId: string, playerId: string) {
  const game = games.get(gameId);
  if (!game) return;

  if (!opponentId) return;

  const field = game.players[opponentId].field;
  const opponentView = game.players[opponentId].opponentView;

  if (!field[clickedId].isHit) {
    field[clickedId].isHit = true;
    opponentView[clickedId].isHit = true;
    opponentView[clickedId].shipId = field[clickedId].shipId;

    const strikedShipId = field[clickedId].shipId;

    if (!!strikedShipId) {
      const strikedShip = field.filter((item: any) => item?.shipId === strikedShipId);
      const strikedDecks = strikedShip.filter((item: any) => item?.isHit);

      if (strikedDecks?.length === strikedShip?.length) {
        let allowedCells: number[] = [];

        strikedDecks.forEach((item: any) => {
          if (item.id % FIELD_SIZE === 0) {
            allowedCells = [item.id + 1, item.id + FIELD_SIZE, item.id - FIELD_SIZE, item.id + FIELD_SIZE_PLUS, item.id - FIELD_SIZE_MINUS];
          }

          if (item.id % FIELD_SIZE === FIELD_SIZE_MINUS) {
            allowedCells = [item.id - 1, item.id - FIELD_SIZE, item.id + FIELD_SIZE, item.id + FIELD_SIZE_MINUS, item.id - FIELD_SIZE_PLUS];
          }

          if (item.id % FIELD_SIZE !== FIELD_SIZE_MINUS && item.id % FIELD_SIZE !== 0) {
            allowedCells = [
              item.id + 1,
              item.id - 1,
              item.id + FIELD_SIZE,
              item.id - FIELD_SIZE,
              item.id + FIELD_SIZE_PLUS,
              item.id - FIELD_SIZE_PLUS,
              item.id + FIELD_SIZE_MINUS,
              item.id - FIELD_SIZE_MINUS,
            ];
          }

          allowedCells.forEach((unit: number) => {
            if (field[unit]) {
              field[unit].isHit = !field[unit].isHit && !field[unit]?.shipId ? true : field[unit]?.isHit;
              opponentView[unit].isHit = field[unit].isHit;
            }
          });
        });

        const isShipsRemained = field.some((item) => item.shipId && !item.isHit);
        if (!isShipsRemained) {
          game.status = "over";
          game.winner = playerId;
        }
      }

      return true;
    }

    game.currentTurnId = opponentId;

    return true;
  }

  return;
}

io.on("connection", (socket: Socket) => {
  console.log("Client connected:", socket.id);

  socket.on("createRoom", () => {
    const roomId = randomUUID();
    const newGame = new Game();

    games.set(roomId, newGame);
    socket.emit("roomCreated", { roomId });
    console.log("Room created: ", roomId, "by: ", socket.id);
  });

  socket.on("joinRoom", (roomId: string) => {
    const game = games.get(roomId);

    if (!game) {
      socket.emit("error", "room_not_found");
      return;
    }

    if (Object.keys(game?.players)?.length >= 2) {
      socket.emit("error", "room_full");
      console.log("room full");

      return;
    }

    if (socket.rooms.has(roomId)) {
      console.log("Already in room", roomId);
      return;
    }

    game.players[socket.id] = new NewPlayer(socket.id);
    socket.data.roomId = roomId;
    socket.join(roomId);
    socket.emit("joinedRoom", { roomId, field: game.players[socket.id].field });

    if (Object.keys(game?.players)?.length === 2) {
      game.status = "placing";
    }
    console.log("Client", socket.id, "joined room", roomId);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    const roomId = socket.data.roomId;

    if (!roomId) return;

    const game = games.get(roomId);

    if (!game) return;

    delete game?.players?.[socket.id];

    const onlinePlayersId = Object.keys(game?.players ?? []);

    if (onlinePlayersId?.length === 0) {
      games.delete(roomId);
      console.log("Room removed");
    }

    if (onlinePlayersId?.length === 1) {
      const opponentId = onlinePlayersId[0];
      const newGame = new Game();
      newGame.players[opponentId] = new NewPlayer(opponentId);

      games.set(roomId, newGame);
      io.to(opponentId).emit("initiateFields", { field: newGame.players[opponentId].field });
    }
  });

  socket.on("buildShip", ({ clickedId }) => {
    const roomId = socket.data.roomId;
    const game = games.get(roomId);
    const placingStatus = game?.status === "placing";

    if (!game || !placingStatus || game.players[socket.id].ready || game.players[socket.id].field[clickedId].shipId) return;

    if (buildShip(clickedId, roomId, socket.id)) {
      socket.emit("fieldUpdate", {
        field: game.players[socket.id].field,
        ready: game.players[socket.id].ready,
      });

      if (game.status === "playing") {
        io.to(roomId).emit("placingComplete", { currentTurnId: game.currentTurnId });
      }
    }
  });

  socket.on("makeStrike", ({ clickedId }) => {
    const roomId = socket.data.roomId;
    const game = games.get(roomId);
    const playingStatus = game?.status === "playing";
    if (!game || !playingStatus || game.currentTurnId !== socket.id) return;

    const opponentId = Object.keys(game.players).find((item) => item !== socket.id);

    if (!opponentId) return;

    if (makeStrike(clickedId, roomId, opponentId, socket.id)) {
      io.to(socket.id).emit("opponentFieldUpdate", { field: game.players[opponentId].opponentView });
      io.to(opponentId).emit("fieldUpdate", { field: game.players[opponentId].field, ready: true });

      if (game.status === "over") {
        io.to(socket.id).emit("isYouWin", { isYouWin: true });
        io.to(opponentId).emit("isYouWin", { isYouWin: false });

        return;
      }

      io.to(opponentId).emit("isYourTurn", { isYourTurn: game.currentTurnId === opponentId });
      io.to(socket.id).emit("isYourTurn", { isYourTurn: game.currentTurnId === socket.id });
    }
  });

  socket.on("refreshGame", () => {
    const roomId = socket.data.roomId;
    const game = games.get(roomId);
    if (!game) return;

    const opponentId = Object.keys(game.players).find((item) => item !== socket.id);
    if (!opponentId) return;

    const newGame = new Game();
    newGame.players[socket.id] = new NewPlayer(socket.id);
    newGame.players[opponentId] = new NewPlayer(opponentId);
    games.set(roomId, newGame);
    io.to(socket.id).emit("initiateFields", { field: newGame.players[socket.id].field });
    io.to(opponentId).emit("initiateFields", { field: newGame.players[opponentId].field });
  });
});

server.listen(PORT, () => {
  console.log("Server is running on port ", PORT);
});
