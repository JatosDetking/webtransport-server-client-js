import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { Server } from "socket.io";
import { Http3Server } from "@fails-components/webtransport";

const key = await readFile("./key.pem");
const cert = await readFile("./cert.pem");

const httpsServer = createServer({
    key,
    cert
}, async (req, res) => {
    try {
        if (req.method === "GET" && req.url === "/") {
            const content = await readFile("./index.html");
            res.writeHead(200, {
                "content-type": "text/html"
            });
            res.write(content);
            res.end();
        } else {
            res.writeHead(404).end();
        }
    } catch (error) {
        console.error("newERRR:", error);
    }
});



const port = process.env.PORT || 3000;

httpsServer.listen(port, () => {
    console.log(`server listening at https://localhost:${port}`);
});

const io = new Server(httpsServer, {
    cors: {
        origin: ["https://localhost:4200","https://localhost:8080",],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ["polling","websocket","webtransport"]
});


process.on('uncaughtException', (err) => {
    console.error('Caught exception:', err);
});


io.on("connection", (socket) => {
    try {
        console.log(`connected with transport ${socket.conn.transport.name}`);
       //console.log('////////////////////////////////////////////////////////')
        // console.log(socket)
        // console.log('////////////////////////////////////////////////////////')
        let counter = 0;
        const clientInterval = setInterval(() => {
            socket.emit("messageToClient", counter);
            counter++;
        }, 1000);

        socket.conn.on("upgrade", (transport) => {
            console.log(`transport upgraded to ${transport.name}`);
        });

        socket.on('joinRoom', (room) => {
            socket.join(room);
            console.log(`User joined room: ${room}`);
          });
        
          socket.on('message', (message, room) => {
            io.to(room).emit('message', message);
          });

        socket.on("videoData", (videoData,room) => {
            //console.log(`Received message from client: ${videoData.imageData}`);
           // socket.emit("videoData", message);
            io.to(room).emit('videoData', videoData);
        });
        socket.on("audioData", (audioData,room) => {
          //  console.log(audioData.audioData)  
         
          //  socket.emit("audioData", audioData);
            io.to(room).emit('audioData', audioData);
        });

        socket.on("disconnect", (reason) => {
            console.log(`disconnected due to ${reason}`);
            clearInterval(clientInterval);
        });
    } catch (err) {
        console.error('Error in socket connection:', err);
    }
});

/* let i = 0;
function sendPeriodicMessages() {
    //console.log(io)
   // console.log("//////////////////////////////////////////////////////////////////////////////",i)
    io.emit("messageToClient", i);
    i++;
}
setInterval(sendPeriodicMessages, 1000); */

const h3Server = new Http3Server({
    port,
    host: "0.0.0.0",
    secret: "changeit",
    cert,
    privKey: key,
  //  path:"test"
});

try {
    (async () => {

        const stream = await h3Server.sessionStream("/socket.io/");
        const sessionReader = stream.getReader();

        while (true) {
            const { done, value } = await sessionReader.read();
            if (done) {
                break;
            }
            io.engine.onWebTransportSession(value);
        }
    })();
} catch (error) {
    console.error("An error occurred while processing the session:", error);
}

h3Server.startServer();