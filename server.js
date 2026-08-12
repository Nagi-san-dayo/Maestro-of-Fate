const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// ルートディレクトリ内の静的ファイル（index.html等）を配信するように修正
app.use(express.static(__dirname));

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let waitingPlayer = null; // マッチング待機中のプレイヤー

io.on('connection', (socket) => {
    console.log('👤 プレイヤー接続:', socket.id);

    // 1. ランダムマッチ参加リクエスト
    socket.on('joinRandomMatch', () => {
        // すでに待機中なら重複追加を防ぐ
        if (waitingPlayer && waitingPlayer.id === socket.id) return;

        if (waitingPlayer && waitingPlayer.connected) {
            // 待機中のプレイヤーが存在すればマッチング成立
            const roomId = `room_${waitingPlayer.id}_${socket.id}`;
            const player1 = waitingPlayer;
            const player2 = socket;

            waitingPlayer = null; // 待機枠をクリア

            player1.join(roomId);
            player2.join(roomId);

            player1.roomId = roomId;
            player2.roomId = roomId;

            console.log(`⚔️ マッチ成立: Room [${roomId}]`);

            // P1 (先攻) と P2 (後攻) を割り当てて対戦開始を通知
            player1.emit('matchFound', { roomId, playerNum: 1, isMyTurn: true });
            player2.emit('matchFound', { roomId, playerNum: 2, isMyTurn: false });
        } else {
            // 誰も待っていなければ待機枠へ
            waitingPlayer = socket;
            socket.emit('waitingForMatch');
            console.log(`⏳ 待機中: ${socket.id}`);
        }
    });

    // 2. マッチングキャンセル
    socket.on('cancelMatch', () => {
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
            socket.emit('matchCanceled');
            console.log(`❌ マッチキャンセル: ${socket.id}`);
        }
    });

    // 3. ターン終了の同期
    socket.on('endTurn', () => {
        if (socket.roomId) {
            // 対戦相手にターンが交代したことを通知
            socket.to(socket.roomId).emit('opponentEndTurn');
        }
    });

    // 4. アクション同期 (カードプレイ、合成、ダメージ等の効果発動)
    socket.on('sendAction', (actionData) => {
        if (socket.roomId) {
            // 自分以外（対戦相手）にアクションデータを転送
            socket.to(socket.roomId).emit('receiveAction', actionData);
        }
    });

    // 5. ゲーム終了・降参の通知
    socket.on('gameOver', (resultData) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('gameOver', resultData);
        }
    });

    // 6. プレイヤー切断処理
    socket.on('disconnect', () => {
        console.log('🚨 プレイヤー切断:', socket.id);
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }
        if (socket.roomId) {
            // 対戦相手に切断を通知
            socket.to(socket.roomId).emit('opponentDisconnected');
            socket.leave(socket.roomId);
            socket.roomId = null;
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
