# Firmware

ESP32 firmware for the AquaFusion sonde. Open `water_quality_monitor/water_quality_monitor.ino` in the Arduino IDE.

| File | Purpose |
|---|---|
| `water_quality_monitor.ino` | Main loop: read, filter, detect, log, upload |
| `Config.h` | Wi-Fi and Supabase settings, sensor calibration constants, flatline thresholds |
| `ADS_Sensors.*` | pH, turbidity, and TDS through the ADS1115 converter |
| `Temperature_Sensor.*` | DS18B20 temperature sensor (1-Wire) |
| `DO_Sensor.*`, `Depth_Sensor.*` | Dissolved oxygen and depth drivers (rewritten October 2026; not yet run on the device) |
| `KalmanFilter.h` | One-dimensional Kalman filter, one instance per sensor |
| `Autoencoder.*` | 5-3-2-3-5 autoencoder with on-device training and anomaly threshold |
| `RunningStats.h` | Running mean and standard deviation (Welford's algorithm) |
| `FlatlineDetector.h` | Stuck-sensor check on raw voltages over a rolling window |
| `SupabaseClient.*` | HTTPS upload of each reading |

`tests/` contains offline tests for the flatline check. They compile with any C++17 compiler and do not need the hardware.

See the main README for what is complete and what is still in progress.
