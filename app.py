from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, emit
import random
import threading
import time
import string
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

# Global dictionary for rooms: room_code -> Room instance
rooms = {}

# Game configuration constants
BOARD_WIDTH = 30
BOARD_HEIGHT = 30
TICK_RATE = 0.1       # seconds per tick
GAME_DURATION = 180   # seconds (3 minutes)

class Snake:
    def __init__(self, id, start_pos, direction, name):
        self.id = id
        self.name = name
        self.body = [start_pos]  # head is the first element
        self.direction = direction  # 'UP', 'DOWN', 'LEFT', 'RIGHT'
        self.grow = 0               # segments to add when food is eaten
        self.points = 0
        self.alive = True

    def move(self):
        if not self.alive:
            return
        head_x, head_y = self.body[0]
        if self.direction == 'UP':
            head_y -= 1
        elif self.direction == 'DOWN':
            head_y += 1
        elif self.direction == 'LEFT':
            head_x -= 1
        elif self.direction == 'RIGHT':
            head_x += 1

        # Wrap around the board edges.
        head_x %= BOARD_WIDTH
        head_y %= BOARD_HEIGHT
        new_head = (head_x, head_y)
        self.body.insert(0, new_head)
        if self.grow > 0:
            self.grow -= 1
        else:
            self.body.pop()

class Room:
    def __init__(self, room_code):
        self.room_code = room_code
        self.players = {}   # maps Socket.IO session id -> Snake instance
        self.food = self.generate_food()
        self.start_time = None
        self.running = False
        self.lock = threading.Lock()
        self.game_thread = None

    def generate_food(self):
        while True:
            x = random.randint(0, BOARD_WIDTH - 1)
            y = random.randint(0, BOARD_HEIGHT - 1)
            collision = False
            for snake in self.players.values():
                if (x, y) in snake.body:
                    collision = True
                    break
            if not collision:
                return (x, y)

    def add_player(self, sid, name):
        with self.lock:
            if len(self.players) == 0:
                # First player: starting near left side moving right.
                snake = Snake(id=1, start_pos=(5, BOARD_HEIGHT // 2), direction='RIGHT', name=name)
            elif len(self.players) == 1:
                # Second player: starting near right side moving left.
                snake = Snake(id=2, start_pos=(BOARD_WIDTH - 6, BOARD_HEIGHT // 2), direction='LEFT', name=name)
            else:
                return None  # Only 2 players supported.
            self.players[sid] = snake
            return snake

    def remove_player(self, sid):
        with self.lock:
            if sid in self.players:
                del self.players[sid]

    def all_players_connected(self):
        return len(self.players) == 2

    def get_game_state(self):
        state = {
            'snakes': {snake.id: list(snake.body) for snake in self.players.values()},
            'food': self.food,
            'points': {snake.id: snake.points for snake in self.players.values()},
            'time_left': max(0, GAME_DURATION - (time.time() - self.start_time)) if self.start_time else GAME_DURATION,
            'names': {snake.id: snake.name for snake in self.players.values()}
        }
        return state

    def check_collisions(self):
        for sid, snake in self.players.items():
            if not snake.alive:
                continue
            head = snake.body[0]
            # Self collision: head touches its own body.
            if head in snake.body[1:]:
                snake.alive = False
                return snake
            # Collision with other snake's body.
            for other_sid, other_snake in self.players.items():
                if other_sid == sid:
                    continue
                if head in other_snake.body:
                    snake.alive = False
                    return snake
        return None

    def update(self):
        with self.lock:
            # Move all snakes.
            for snake in self.players.values():
                snake.move()
            # Check for food collision.
            for snake in self.players.values():
                if snake.alive and snake.body[0] == self.food:
                    snake.grow += 1
                    snake.points += 1
                    self.food = self.generate_food()
            dead_snake = self.check_collisions()
            return dead_snake

    def game_loop(self):
        # Start time when both players are online.
        self.running = True
        self.start_time = time.time()
        while self.running:
            with self.lock:
                if time.time() - self.start_time >= GAME_DURATION:
                    self.running = False
                    break
            dead = self.update()
            if dead:
                self.running = False
                break
            state = self.get_game_state()
            socketio.emit('game_update', state, room=self.room_code)
            time.sleep(TICK_RATE)
        # At game end, determine the winner.
        state = self.get_game_state()
        winner = None
        if len(self.players) == 2:
            snakes = list(self.players.values())
            s1, s2 = snakes[0], snakes[1]
            if not s1.alive and s2.alive:
                winner = s2
            elif not s2.alive and s1.alive:
                winner = s1
            else:
                if s1.points > s2.points:
                    winner = s1
                elif s2.points > s1.points:
                    winner = s2
                else:
                    winner = None  # Tie
        elif len(self.players) == 1:
            winner = list(self.players.values())[0]
        result = {
            'snakes': state['snakes'],
            'food': state['food'],
            'points': state['points'],
            'time_left': 0,
            'names': state['names'],
            'winner': winner.name if winner else 'Tie'
        }
        socketio.emit('game_over', result, room=self.room_code)

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('create_room')
def handle_create_room(data):
    name = data.get('name', 'Player')
    room_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    room = Room(room_code)
    rooms[room_code] = room
    join_room(room_code)
    snake = room.add_player(request.sid, name)
    emit('room_created', {'room': room_code, 'snake_id': snake.id, 'name': snake.name})
    print(f"Room {room_code} created by {request.sid} ({name})")

@socketio.on('join_room')
def handle_join_room(data):
    room_code = data.get('room')
    name = data.get('name', 'Player')
    room = rooms.get(room_code)
    if room and len(room.players) < 2:
        join_room(room_code)
        snake = room.add_player(request.sid, name)
        emit('room_joined', {'room': room_code, 'snake_id': snake.id, 'name': snake.name})
        print(f"{request.sid} joined room {room_code} ({name})")
        if room.all_players_connected():
            room.game_thread = threading.Thread(target=room.game_loop)
            room.game_thread.start()
            socketio.emit('start_game', room=room_code)
    else:
        emit('error', {'message': 'Room not found or full'})

@socketio.on('change_direction')
def handle_change_direction(data):
    room_code = data.get('room')
    direction = data.get('direction')
    room = rooms.get(room_code)
    if room and request.sid in room.players:
        snake = room.players[request.sid]
        opposite = {'UP': 'DOWN', 'DOWN': 'UP', 'LEFT': 'RIGHT', 'RIGHT': 'LEFT'}
        if direction != opposite.get(snake.direction):
            snake.direction = direction

@socketio.on('disconnect')
def handle_disconnect():
    for room in list(rooms.values()):
        if request.sid in room.players:
            room.remove_player(request.sid)
            room.running = False  # Stop the game if a player disconnects.
            socketio.emit('game_over', {'message': 'Player disconnected'}, room=room.room_code)
            print(f"{request.sid} disconnected from room {room.room_code}")
            break

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host='0.0.0.0', port=port)
