const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// publicフォルダ内の静的ファイル（index.html等）を配信
app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let waitingPlayer = null; // マッチング待機中のプレイヤー

io.on('connection', (socket) => {
    console.log('プレイヤー接続:', socket.id);

    // ランダムマッチ参加リクエスト
    socket.on('joinRandomMatch', () => {
        // すでに待機中なら重複追加を防ぐ
        if (waitingPlayer && waitingPlayer.id === socket.id) return;

        if (waitingPlayer && waitingPlayer.connected) {
            // 待機中のプレイヤーが存在すればマッチング成立
            const roomId = `room_${waitingPlayer.id}_${socket.id}`;
            const player1 = waitingPlayer;
            const player2 = socket;

            player1.join(roomId);
            player2.join(roomId);

            player1.roomId = roomId;
            player2.roomId = roomId;

            // 各プレイヤーへ対戦相手決定を通知（P1/P2の割り当て）
            player1.emit('matchFound', { roomId, playerNum: 1, opponentId: player2.id });
            player2.emit('matchFound', { roomId, playerNum: 2, opponentId: player1.id });

            waitingPlayer = null; // キューをクリア
        } else {
            // 誰も待っていなければ待機枠へ
            waitingPlayer = socket;
            socket.emit('waitingForMatch');
        }
    });

    // マッチングキャンセル
    socket.on('cancelMatch', () => {
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
            socket.emit('matchCanceled');
        }
    });

    // ゲームの初期状態同期（Host/P1 から受信して相手へ転送）
    socket.on('initGameState', (stateData) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('initGameState', stateData);
        }
    });

    // アクション同期（カードプレイ・コード合成・ターン終了等）
    socket.on('sendAction', (action) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receiveAction', action);
        }
    });

    // 切断処理
    socket.on('disconnect', () => {
        console.log('プレイヤー切断:', socket.id);
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }
        if (socket.roomId) {
            io.to(socket.roomId).emit('opponentDisconnected');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
