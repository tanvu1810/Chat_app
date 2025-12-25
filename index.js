import { Server } from 'socket.io';


const app = express();
const server = createServer(app);
const io = new Server(server);
c
const __dirname = dirname(fileURLToPath(import.meta.url));

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));                                              
});

io.on('connection', (socket) => {
  console.log('a user connected');
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

io.on('connection', (socket) => {
  socket.on('chat message', (msg) => {
    io.emit('chat message', msg);
  });
});
    
server.listen(3000, () => {
  console.log('server running at http://localhost:3000');
});