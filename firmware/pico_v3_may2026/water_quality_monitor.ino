#include <SPI.h>
#include <SD.h>

#include "KalmanFilter.h"
#include "DS18B20_Sensor.h"
#include "TDS_Sensor.h"
#include "PH_Sensor.h"
#include "Turbidity_Sensor.h"
#include "Depth_Sensor.h"
#include "Autoencoder.h"

#define LOG_INTERVAL_MS    10000UL
#define CSV_FILENAME       "sensor_log.csv"
#define ANOMALY_FILENAME   "anomaly_log.csv"
#define SD_CS_PIN          17

#define PH_MIN    6.5f
#define PH_MAX    8.5f
#define TDS_MAX   500.0f
#define TURB_MAX  200.0f
#define TEMP_MIN  0.0f
#define TEMP_MAX  35.0f

KalmanFilter kf_tds        (5.0f,  0.10f);
KalmanFilter kf_ph         (0.5f,  0.01f);
KalmanFilter kf_turbidity  (4.0f,  0.10f);
KalmanFilter kf_temperature(0.3f,  0.01f);
KalmanFilter kf_depth      (3.0f,  0.05f);

Autoencoder autoencoder;

const float AE_MIN[AE_INPUT_SIZE] = {   0.0f,  0.0f,    0.0f,  0.0f,  0.0f };
const float AE_MAX[AE_INPUT_SIZE] = { 500.0f, 14.0f, 4000.0f, 40.0f, 10.0f };

bool sdReady        = false;
unsigned long lastLogTime = 0;

bool isOutOfRange(float v, float lo, float hi) {
    return (v < lo || v > hi);
}

void writeCSVHeader(Print& out) {
    out.println(
        "tds_raw,tds_filtered,"
        "ph_raw,ph_filtered,"
        "turbidity_raw,turbidity_filtered,"
        "temperature_raw,temperature_filtered,"
        "depth_raw,depth_filtered,"
        "timestamp_s"
    );
}

void writeAnomalyHeader(Print& out) {
    out.println("timestamp_s,mse,threshold,tds_f,ph_f,turbidity_f,temperature_f,depth_f");
}

void writeAnomalyRow(Print& out,
                     unsigned long ts, float mse, float thresh,
                     float tdsF, float phF, float turbF, float tempF, float depF)
{
    char buf[120];
    snprintf(buf, sizeof(buf),
        "%lu,%.5f,%.5f,%.2f,%.2f,%.2f,%.2f,%.2f",
        ts, mse, thresh, tdsF, phF, turbF, tempF, depF);
    out.println(buf);
}

void writeCSVRow(Print& out,
                 float tdsR,   float tdsF,
                 float phR,    float phF,
                 float turbR,  float turbF,
                 float tempR,  float tempF,
                 float depR,   float depF,
                 unsigned long ts)
{

    char buf[160];
    snprintf(buf, sizeof(buf),
        "%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%lu",
        tdsR,  tdsF,
        phR,   phF,
        turbR, turbF,
        tempR, tempF,
        depR,  depF,
        ts);
    out.println(buf);
}

void printReadable(float tdsR,  float tdsF,
                   float phR,   float phF,
                   float turbR, float turbF,
                   float tempR, float tempF,
                   float depR,  float depF)
{
    Serial.println(F("# ----------------------------------------"));

    Serial.print(F("#  TDS         raw="));  Serial.print(tdsR,  1);
    Serial.print(F(" ppm  filtered="));      Serial.print(tdsF,  1);
    Serial.print(F(" ppm  ["));              Serial.print(tdsSensor_classify(tdsF));
    if (tdsF > TDS_MAX) Serial.print(F(" *ALERT*"));
    Serial.println(F("]"));

    Serial.print(F("#  pH          raw="));  Serial.print(phR,   2);
    Serial.print(F("     filtered="));       Serial.print(phF,   2);
    Serial.print(F("     ["));               Serial.print(phSensor_classify(phF));
    if (isOutOfRange(phF, PH_MIN, PH_MAX)) Serial.print(F(" *ALERT*"));
    Serial.println(F("]"));

    Serial.print(F("#  Turbidity   raw="));  Serial.print(turbR, 1);
    Serial.print(F(" NTU  filtered="));      Serial.print(turbF, 1);
    Serial.print(F(" NTU  ["));              Serial.print(turbiditySensor_classify(turbF));
    if (turbF > TURB_MAX) Serial.print(F(" *ALERT*"));
    Serial.println(F("]"));

    Serial.print(F("#  Temperature raw="));  Serial.print(tempR, 2);
    Serial.print(F(" C   filtered="));      Serial.print(tempF, 2);
    Serial.print(F(" C   ["));              Serial.print(tempSensor_classify(tempF));
    if (isOutOfRange(tempF, TEMP_MIN, TEMP_MAX)) Serial.print(F(" *ALERT*"));
    Serial.println(F("]"));

    Serial.print(F("#  Depth       raw="));  Serial.print(depR,  1);
    Serial.print(F(" cm   filtered="));      Serial.print(depF,  1);
    Serial.print(F(" cm   ["));              Serial.print(depthSensor_classify(depF));
    Serial.println(F("]"));

    Serial.println(F("# ----------------------------------------"));
}

void setup() {
    Serial.begin(115200);
    unsigned long t0 = millis();
    while (!Serial && millis() - t0 < 3000);

    Serial.println(F("# Water Quality Monitor booting..."));

    analogReadResolution(12);

    tempSensor_init();
    tdsSensor_init();
    phSensor_init();
    turbiditySensor_init();
    depthSensor_init();

    autoencoder.setNormParams(AE_MIN, AE_MAX);
    Serial.println(F("# Autoencoder ready. Training for 50 samples before anomaly detection starts."));

    Serial.print(F("# SD card... "));
    if (SD.begin(SD_CS_PIN)) {
        sdReady = true;
        Serial.println(F("OK"));

        if (!SD.exists(CSV_FILENAME)) {
            File f = SD.open(CSV_FILENAME, FILE_WRITE);
            if (f) { writeCSVHeader(f); f.close(); }
        } else {
            Serial.println(F("# Appending to existing file."));
        }

        if (!SD.exists(ANOMALY_FILENAME)) {
            File f = SD.open(ANOMALY_FILENAME, FILE_WRITE);
            if (f) { writeAnomalyHeader(f); f.close(); }
        }
    } else {
        Serial.println(F("FAILED: SD logging disabled."));
    }

    writeCSVHeader(Serial);

    lastLogTime = millis() - LOG_INTERVAL_MS;
    Serial.println(F("# Ready."));
}

void loop() {
    if (millis() - lastLogTime < LOG_INTERVAL_MS) return;
    lastLogTime = millis();

    float tempRaw  = tempSensor_readC();
    float tdsRaw   = tdsSensor_readPPM(tempRaw > -100.0f ? tempRaw : 25.0f);
    float phRaw    = phSensor_readPH();
    float turbRaw  = turbiditySensor_readNTU();
    float depthRaw = depthSensor_readCM();

    float tdsF   = kf_tds.update(tdsRaw);
    float phF    = kf_ph.update(phRaw);
    float turbF  = kf_turbidity.update(turbRaw);
    float tempF  = kf_temperature.update(tempRaw > -100.0f ? tempRaw : tempF);
    float depthF = kf_depth.update(depthRaw);

    unsigned long timestamp = millis() / 1000UL;

    float aeInput[AE_INPUT_SIZE] = { tdsF, phF, turbF, tempF, depthF };

    if (!autoencoder.isReady()) {

        float mse = autoencoder.train(aeInput);
        Serial.print(F("# [AE TRAINING] sample="));
        Serial.print(autoencoder.trainCount());
        Serial.print(F("/"));
        Serial.print(AE_WARMUP_SAMPLES);
        Serial.print(F("  MSE="));
        Serial.println(mse, 5);
    } else {

        float mse    = autoencoder.reconstructionError(aeInput);
        float thresh = autoencoder.threshold();
        bool  anomaly = (mse > thresh);

        Serial.print(F("# [AE] MSE="));
        Serial.print(mse, 5);
        Serial.print(F("  threshold="));
        Serial.print(thresh, 5);

        if (anomaly) {
            Serial.println(F("  *** ANOMALY DETECTED ***"));

            if (sdReady) {
                File af = SD.open(ANOMALY_FILENAME, FILE_WRITE);
                if (af) {
                    writeAnomalyRow(af, timestamp, mse, thresh,
                                    tdsF, phF, turbF, tempF, depthF);
                    af.close();
                }
            }

            for (int b = 0; b < 5; b++) {
                digitalWrite(LED_BUILTIN, HIGH); delay(80);
                digitalWrite(LED_BUILTIN, LOW);  delay(80);
            }
        } else {
            Serial.println(F("  OK"));
        }
    }

    writeCSVRow(Serial,
                tdsRaw,  tdsF,
                phRaw,   phF,
                turbRaw, turbF,
                tempRaw, tempF,
                depthRaw, depthF,
                timestamp);

    printReadable(tdsRaw, tdsF, phRaw, phF, turbRaw, turbF, tempRaw, tempF, depthRaw, depthF);

    if (sdReady) {
        File f = SD.open(CSV_FILENAME, FILE_WRITE);
        if (f) {
            writeCSVRow(f,
                        tdsRaw,  tdsF,
                        phRaw,   phF,
                        turbRaw, turbF,
                        tempRaw, tempF,
                        depthRaw, depthF,
                        timestamp);
            f.close();
        } else {
            Serial.println(F("# SD write error"));
        }
    }

    digitalWrite(LED_BUILTIN, HIGH); delay(80); digitalWrite(LED_BUILTIN, LOW);
}
