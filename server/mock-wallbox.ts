import { createSocket } from "dgram";

const MOCK_PORT = 7090;
let mockState = {
  State: 2,
  Plug: 5,
  "Enable sys": 1,
  "Max curr": 16000,
  P: 0,
  E_pres: 1234,
  E_total: 50000,
};

const server = createSocket("udp4");

server.on("message", (msg, rinfo) => {
  const command = msg.toString().trim();
  console.log(`Mock Wallbox received: ${command} from ${rinfo.address}:${rinfo.port}`);

  let response = "";

  if (command === "report 1") {
    response = `TCH-OK :done
Report 1: ID=${mockState.State === 3 ? 123456 : 654321}
State=${mockState.State}
Plug=${mockState.Plug}
Enable sys=${mockState["Enable sys"]}
Max curr=${mockState["Max curr"]}`;
  } else if (command === "report 2") {
    response = `TCH-OK :done
Report 2: ID=789
P=${mockState.P}
E pres=${mockState.E_pres}`;
  } else if (command === "report 3") {
    response = `TCH-OK :done
Report 3: ID=3
U1=230
U2=230
U3=230
I1=${mockState.State === 3 ? 10000 : 0}
I2=${mockState.State === 3 ? 10000 : 0}
I3=${mockState.State === 3 ? 10000 : 0}
P=${mockState.P}
E pres=${mockState.E_pres}
E total=${mockState.E_total}`;
  } else if (command === "ena 1") {
    mockState.State = 3;
    mockState.P = 11000;
    response = "TCH-OK :done";
    console.log("Mock Wallbox: Charging STARTED");
  } else if (command === "ena 0") {
    mockState.State = 2;
    mockState.P = 0;
    response = "TCH-OK :done";
    console.log("Mock Wallbox: Charging STOPPED");
  } else {
    response = "TCH-ERR :unknown command";
  }

  server.send(response, rinfo.port, rinfo.address, (err) => {
    if (err) {
      console.error("Mock Wallbox send error:", err);
    } else {
      console.log(`Mock Wallbox sent: ${response.substring(0, 50)}...`);
    }
  });
});

server.on("error", (err) => {
  console.error("Mock Wallbox error:", err);
  server.close();
});

server.bind(MOCK_PORT, "0.0.0.0", () => {
  console.log(`Mock KEBA Wallbox listening on UDP port ${MOCK_PORT}`);
});
