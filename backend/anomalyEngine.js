// backend/anomalyEngine.js
const crypto = require('crypto');

class SignalAnomalyEngine {
  constructor(config = {}) {
    this.windowSize = config.windowSize || 10;
    this.stdevThreshold = config.stdevThreshold || 5.0; // Trigger lock when STDEV > 5.0
    this.consecutiveThreshold = config.consecutiveThreshold || 5; // Temporal filter for false positives
    
    this.readingBuffer = [];
    this.consecutiveSpikes = 0;
    this.isLocked = false;
    this.secretKey = config.secretKey || 'MetaMind_SIH2026_SecretKey';
  }

  // Calculate Rolling Standard Deviation (STDEV)
  calculateSTDEV(data) {
    const n = data.length;
    if (n < 2) return 0;
    const mean = data.reduce((a, b) => a + b, 0) / n;
    const variance = data.reduce((sq, val) => sq + Math.pow(val - mean, 2), 0) / (n - 1);
    return Math.sqrt(variance);
  }

  // Verify Calibration Parameter Integrity using HMAC-SHA-256
  verifyMemoryIntegrity(calibrationData, expectedHash) {
    const computedHash = crypto
      .createHmac('sha256', this.secretKey)
      .update(JSON.stringify(calibrationData))
      .digest('hex');
    return computedHash === expectedHash;
  }

  // Process incoming stream from HX711 indicator
  processReading(adcRawValue, calibrationConfig, calibrationHash) {
    if (this.isLocked) {
      return { status: 'LOCKED', message: 'Display locked due to signal anomaly.' };
    }

    // 1. HMAC Calibration Integrity Check
    if (!this.verifyMemoryIntegrity(calibrationConfig, calibrationHash)) {
      this.triggerLockdown('EEPROM/Calibration Tamper Detected (HMAC mismatch)');
      return { status: 'ALERT', reason: 'HMAC_MISMATCH' };
    }

    // 2. Windowing buffer
    this.readingBuffer.push(adcRawValue);
    if (this.readingBuffer.length > this.windowSize) {
      this.readingBuffer.shift();
    }

    // 3. Signal Variance Check
    if (this.readingBuffer.length === this.windowSize) {
      const currentSTDEV = this.calculateSTDEV(this.readingBuffer);

      if (currentSTDEV > this.stdevThreshold) {
        this.consecutiveSpikes += 1;
        
        // Require elevated variance across 5 consecutive windows to eliminate false bumps
        if (this.consecutiveSpikes >= this.consecutiveThreshold) {
          this.triggerLockdown(`RF Anomaly Detected: STDEV Spike = ${currentSTDEV.toFixed(2)}`);
          return { status: 'ALERT', stdev: currentSTDEV };
        }
      } else {
        this.consecutiveSpikes = 0;
      }
    }

    return { status: 'OK', value: adcRawValue };
  }

  triggerLockdown(reason) {
    this.isLocked = true;
    console.error(`[LOCKDOWN TRIGGERED]: ${reason}`);
  }
}

module.exports = SignalAnomalyEngine;
