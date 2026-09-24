// simulator/scaleSimulator.js
const { io } = require('socket.io-client');
const readline = require('readline');

// Connect to your Node.js WebSocket backend (local or production Render URL)
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const socket = io(BACKEND_URL);

let baseWeight = 500.0; // Simulated 500g test load
let stdevSpikeActive = false;

socket.on('connect', () => {
  console.log('\n==================================================');
  console.log(` Connected to Meta Mind Backend at: ${BACKEND_URL}`);
  console.log(' Scale Telemetry Simulator Active (HX711 Node)');
  console.log('==================================================');
  console.log(' Controls for Live Presentation Demo:');
  console.log('   Press [S] -> Trigger RF Remote Anomaly Spike (STDEV > 5.0)');
  console.log('   Press [N] -> Restore Normal Signal Operations');
  console.log('   Press [Ctrl + C] -> Exit Simulator');
  console.log('==================================================\n');
});

socket.on('disconnect', () => {
  console.log('Disconnected from backend server.');
});

// Configure CLI keyboard inputs
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

process.stdin.on('keypress', (str, key) => {
  if (key.name === 's') {
    stdevSpikeActive = true;
    console.log('\n🚨 [DEMO TRIGGER]: RF Remote Interference Active! Injecting signal variance (STDEV > 5.0)...\n');
  } else if (key.name === 'n') {
    stdevSpikeActive = false;
    console.log('\n🟢 [DEMO TRIGGER]: Signal Restored. Normal scale telemetry resumed.\n');
  } else if (key.ctrl && key.name === 'c') {
    process.exit();
  }
});

// Stream raw ADC readings every 100ms
setInterval(() => {
  if (!socket.connected) return;

  let reading;
  if (stdevSpikeActive) {
    // Generate high-variance noise spikes (STDEV > 5.0) simulating RF remote interference
    reading = baseWeight + (Math.random() * 90.0 - 45.0);
  } else {
    // Generate standard low-noise ADC drift (+/- 0.2g)
    reading = baseWeight + (Math.random() * 0.4 - 0.2);
  }

  // Dispatch raw reading to backend Signal Anomaly Engine
  socket.emit('SCALE_RAW_READING', {
    deviceId: 'SCALE_DEVICE_001',
    adcReading: parseFloat(reading.toFixed(2)),
    timestamp: Date.now()
  });
}, 100);
