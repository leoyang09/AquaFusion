# AquaFusion

AquaFusion is a $180 water-quality sonde for small lakes and ponds. It measures temperature, pH, turbidity, dissolved oxygen, and depth, and uploads readings to a phone app. A small autoencoder runs on the microcontroller itself. It learns what normal looks like at each site and flags readings that don't fit.

We built it for the 2026 TSA High School Engineering Design event, where our team placed 1st in Washington and 3rd at nationals.

## Team

- **Leo Yang:** all of the software (firmware, Kalman filters, autoencoder, mobile app, email alerts). Also helped wire, solder, calibrate, assemble, and field-test the hardware.
- **Aashrith Pisupati:** 3D-printed enclosure, most of the wiring and soldering, waterproofing.
- **Anindita Purkayastha, Tiffany Chi, Manas Mishra:** helped build and test the prototype.
- **Preetika Kaur:** display.

## What's in here

- `firmware/water_quality_monitor/`: the ESP32 firmware
- `firmware/pico_v3_may2026/`: older firmware from the Raspberry Pi Pico version
- `firmware/tests/`: tests for the flatline check, plus the data from our September 26 milk test
- `app/`, `src/`, `components/`: the mobile app (Expo / React Native)
- `ingest_gateway.py`: a small server that emails an alert when a reading is flagged

## How it works

Every reading goes through the same steps on the ESP32:

1. Read each sensor and convert the voltage to real units.
2. Smooth it with a Kalman filter. Each sensor has its own filter settings.
3. Run it through the autoencoder. For the first 50 readings the autoencoder trains on the water it's in. After that, it flags any reading it can't reconstruct well and names the sensor that looks most off.
4. Check for stuck sensors. If a sensor's voltage stops changing completely, it gets flagged.
5. Save the reading to the SD card and upload it to Supabase. The app shows it live and sends a push alert if it was flagged.

## Current status

- The final firmware from the competition is still running on the device, but its source file was lost. The firmware here is based on the last saved version, so its network settings, upload interval, and dissolved oxygen and depth code differ from what ran in our demo.
- The dissolved oxygen and depth drivers were rewritten in October 2026. They compile but haven't been tested on the device yet.
- The flatline check passes its tests, including a replay of our real milk-test data, but its thresholds haven't been tuned on the device yet.
- Next steps: a new pH probe, alarming on the Kalman filter's innovation (which would have caught the milk spike 18 seconds sooner in our test), and longer deployments.
- Before this repository, AquaFusion was developed in two separate private repositories, one for the Raspberry Pi Pico firmware (May 2026) and one for the mobile app (May to June 2026). This repository combines the current code from both, so its history starts here.

## Running it

**Firmware:** Arduino IDE 2 with the ESP32 board package and the Adafruit ADS1X15, OneWire, and DallasTemperature libraries. Put your Wi-Fi and Supabase settings in `firmware/water_quality_monitor/Config.h`, then upload.

**Tests:**
```
cd firmware/tests
g++ -std=c++17 -O2 -Wall flatline_test.cpp -o flatline_test && ./flatline_test
```

**App:** copy `.env.example` to `.env`, add your Supabase URL and anon key, then run `npm install` and `npx expo start`.

**Email alerts:** copy `.env.server.example` to `.env.server`, fill it in, then run `pip install fastapi uvicorn httpx python-dotenv` and `uvicorn ingest_gateway:app --port 8000`.

## Credits

Sensor conversion formulas are based on the DFRobot and Keyestudio sensor documentation.
