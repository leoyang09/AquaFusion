#include <WiFi.h>
#include <SPI.h>
#include <SD.h>

#include "Config.h"
#include "KalmanFilter.h"
#include "Autoencoder.h"
#include "RunningStats.h"
#include "ADS_Sensors.h"
#include "Temperature_Sensor.h"
#include "DO_Sensor.h"
#include "Depth_Sensor.h"
#include "SupabaseClient.h"
#include "FlatlineDetector.h"

#define SD_CS_PIN          5
#define CSV_FILENAME       "/sensor_log.csv"
#define ANOMALY_FILENAME   "/anomaly_log.csv"
#define FAULT_FILENAME     "/fault_log.csv"
bool sdReady = false;

KalmanFilter kf_do  (1.0f,  0.05f);
KalmanFilter kf_temp(0.3f,  0.01f);
KalmanFilter kf_ph  (0.5f,  0.01f);
KalmanFilter kf_turb(4.0f,  0.10f);
KalmanFilter kf_depth(3.0f, 0.05f);

Autoencoder autoencoder;
const float AE_MIN[AE_INPUT_SIZE] = { 0.0f,  0.0f,  0.0f,    0.0f,  0.0f };
const float AE_MAX[AE_INPUT_SIZE] = { 15.0f, 40.0f, 14.0f, 4000.0f, 10.0f };

RunningStats stats_do, stats_temp, stats_ph, stats_turb, stats_depth;

FlatlineDetector<FLAT_WINDOW> flat_ph, flat_turb, flat_do, flat_depth;

unsigned long lastUploadTime = 0;

void connectWiFi() {
    Serial.print(F("# Connecting to WiFi"));
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
        Serial.print(F("."));
        delay(500);
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.print(F("# WiFi connected. IP: "));
        Serial.println(WiFi.localIP());
    } else {
        Serial.println();
        Serial.println(F("# WiFi FAILED to connect - will retry in loop."));
    }
}

void writeCSVHeader(Print& out) {
    out.println("timestamp_s,do_raw,do_f,temp_raw,temp_f,ph_raw,ph_f,turb_raw,turb_f,depth_raw,depth_f");
}

void writeCSVRow(Print& out, unsigned long ts,
                float doR, float doF, float tempR, float tempF,
                float phR, float phF, float turbR, float turbF,
                float depR, float depF) {
    char buf[160];
    snprintf(buf, sizeof(buf), "%lu,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f",
        ts, doR, doF, tempR, tempF, phR, phF, turbR, turbF, depR, depF);
    out.println(buf);
}

void writeAnomalyHeader(Print& out) {
    out.println("timestamp_s,mse,threshold,source,confidence,do_f,temp_f,ph_f,turb_f,depth_f");
}

void writeAnomalyRow(Print& out, unsigned long ts, float mse, float thresh,
                    const char* source, int confidence,
                    float doF, float tempF, float phF, float turbF, float depF) {
    char buf[160];
    snprintf(buf, sizeof(buf), "%lu,%.5f,%.5f,%s,%d,%.2f,%.2f,%.2f,%.2f,%.2f",
        ts, mse, thresh, source, confidence, doF, tempF, phF, turbF, depF);
    out.println(buf);
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println(F("# ESP32 Water Quality Monitor - booting..."));

    connectWiFi();
    supabase_init();

    Wire.begin();

    if (!adsSensors_init()) {
        Serial.println(F("# ERROR: ADS1115 not found! Check wiring."));
    } else {
        Serial.println(F("# ADS1115 ready."));
    }

    tempSensor_init();
    doSensor_init();
    depthSensor_init();

    autoencoder.setNormParams(AE_MIN, AE_MAX);
    Serial.print(F("# Autoencoder ready. Training for "));
    Serial.print(AE_WARMUP_SAMPLES);
    Serial.println(F(" samples before anomaly detection starts."));

    Serial.print(F("# SD card... "));
    if (SD.begin(SD_CS_PIN)) {
        sdReady = true;
        Serial.println(F("OK"));
        if (!SD.exists(CSV_FILENAME)) {
            File f = SD.open(CSV_FILENAME, FILE_WRITE);
            if (f) { writeCSVHeader(f); f.close(); }
        }
        if (!SD.exists(FAULT_FILENAME)) {
            File ff = SD.open(FAULT_FILENAME, FILE_WRITE);
            if (ff) { ff.println("timestamp_s,fault"); ff.close(); }
        }
        if (!SD.exists(ANOMALY_FILENAME)) {
            File f = SD.open(ANOMALY_FILENAME, FILE_WRITE);
            if (f) { writeAnomalyHeader(f); f.close(); }
        }
    } else {
        Serial.println(F("not present - continuing without local backup."));
    }

    lastUploadTime = millis() - UPLOAD_INTERVAL_MS;
    Serial.println(F("# Ready."));
}

void loop() {
    if (millis() - lastUploadTime < UPLOAD_INTERVAL_MS) return;
    lastUploadTime = millis();

    float tempRaw = tempSensor_readC();
    bool tempFailed = (tempRaw <= -100.0f);
    if (tempFailed) tempRaw = 25.0f;

    ADSReadings ads = adsSensors_read();
    float doRaw    = doSensor_readMGL(tempRaw);
    float depthRaw = depthSensor_readM();

#if SENSOR_CAL_DEBUG
    Serial.print(F("# CAL do_mV="));
    Serial.print(doSensor_lastMillivolts(), 1);
    Serial.print(F("  depth_mV="));
    Serial.println(depthSensor_lastMillivolts(), 1);
#endif

    flat_ph.update(ads.phVoltage);
    flat_turb.update(ads.turbidityVoltage);
    flat_do.update(doSensor_lastMillivolts() / 1000.0f);
    flat_depth.update(depthSensor_lastMillivolts() / 1000.0f);

    char sensorFault[64] = "";
    auto addFault = [&](const char* name) {
        if (sensorFault[0]) strlcat(sensorFault, ";", sizeof(sensorFault));
        strlcat(sensorFault, name, sizeof(sensorFault));
    };
    if (flat_ph.isFlat(FLAT_THRESH_PH_V))         addFault("ph_flatline");
    if (flat_turb.isFlat(FLAT_THRESH_TURB_V))     addFault("turbidity_flatline");
    if (flat_do.isFlat(FLAT_THRESH_DO_V))         addFault("do_flatline");
    if (flat_depth.isFlat(FLAT_THRESH_DEPTH_V))   addFault("depth_flatline");
    if (tempFailed)                               addFault("temperature_read_failed");

#if FLATLINE_DEBUG
    Serial.print(F("# [FLAT] std V  ph="));   Serial.print(flat_ph.stddev(), 6);
    Serial.print(F("  turb="));               Serial.print(flat_turb.stddev(), 6);
    Serial.print(F("  do="));                 Serial.print(flat_do.stddev(), 6);
    Serial.print(F("  depth="));              Serial.print(flat_depth.stddev(), 6);
    Serial.println(flat_ph.ready() ? "" : "  (window filling)");
#endif

    float doF    = kf_do.update(doRaw);
    float tempF  = kf_temp.update(tempRaw);
    float phF    = kf_ph.update(ads.ph);
    float turbF  = kf_turb.update(ads.turbidityNTU);
    float depthF = kf_depth.update(depthRaw);

    unsigned long timestamp = millis() / 1000UL;

    stats_do.update(doF);
    stats_temp.update(tempF);
    stats_ph.update(phF);
    stats_turb.update(turbF);
    stats_depth.update(depthF);

    float aeInput[AE_INPUT_SIZE] = { doF, tempF, phF, turbF, depthF };

    bool        isAnomaly      = false;
    const char* anomalySource  = "";
    int         confidence     = 0;
    float       mse            = 0.0f;
    float       thresh         = 0.0f;

    if (!autoencoder.isReady()) {
        mse = autoencoder.train(aeInput);
        Serial.print(F("# [AE TRAINING] sample="));
        Serial.print(autoencoder.trainCount());
        Serial.print(F("/"));
        Serial.print(AE_WARMUP_SAMPLES);
        Serial.print(F("  MSE="));
        Serial.println(mse, 5);
    } else {
        mse    = autoencoder.reconstructionError(aeInput);
        thresh = autoencoder.threshold();
        isAnomaly = (mse > thresh);

        Serial.print(F("# [AE] MSE="));
        Serial.print(mse, 5);
        Serial.print(F("  threshold="));
        Serial.print(thresh, 5);

        if (isAnomaly) {

            float perChannelErr[AE_INPUT_SIZE];
            autoencoder.reconstructionErrorPerChannel(aeInput, perChannelErr);

            const char* channelNames[AE_INPUT_SIZE] = {
                "dissolved_oxygen", "temperature", "ph", "turbidity", "water_depth"
            };

            int worst = 0;
            for (int i = 1; i < AE_INPUT_SIZE; i++) {
                if (perChannelErr[i] > perChannelErr[worst]) worst = i;
            }
            anomalySource = channelNames[worst];

            confidence = (int)constrain((mse / thresh) * 50.0f, 0.0f, 100.0f);

            Serial.println(F("  *** ANOMALY DETECTED ***"));
            Serial.print(F("#   source="));
            Serial.print(anomalySource);
            Serial.print(F("  confidence="));
            Serial.println(confidence);

            if (sdReady) {
                File af = SD.open(ANOMALY_FILENAME, FILE_APPEND);
                if (af) {
                    writeAnomalyRow(af, timestamp, mse, thresh, anomalySource, confidence,
                                    doF, tempF, phF, turbF, depthF);
                    af.close();
                }
            }
        } else {
            Serial.println(F("  OK"));
        }
    }

    if (sensorFault[0]) {
        Serial.print(F("# *** SENSOR FAULT: "));
        Serial.println(sensorFault);
        if (sdReady) {
            File ff = SD.open(FAULT_FILENAME, FILE_APPEND);
            if (ff) { ff.print(timestamp); ff.print(','); ff.println(sensorFault); ff.close(); }
        }
    }

    if (sdReady) {
        File f = SD.open(CSV_FILENAME, FILE_APPEND);
        if (f) {
            writeCSVRow(f, timestamp, doRaw, doF, tempRaw, tempF,
                        ads.ph, phF, ads.turbidityNTU, turbF, depthRaw, depthF);
            f.close();
        }
    }

    SensorLogPayload payload;
    payload.sonde_id          = SONDE_ID;
    payload.location_name     = LOCATION_NAME;
    payload.temperature       = tempF;
    payload.dissolved_oxygen  = doF;
    payload.ph                = phF;
    payload.turbidity         = turbF;
    payload.water_depth       = depthF;
    payload.is_anomaly        = isAnomaly;
    payload.anomaly_source    = anomalySource;
    payload.confidence_level  = confidence;
    payload.std_dev_do        = stats_do.stddev();
    payload.std_dev_temp      = stats_temp.stddev();
    payload.std_dev_ph        = stats_ph.stddev();
    payload.std_dev_turbidity = stats_turb.stddev();
    payload.std_dev_depth     = stats_depth.stddev();
    payload.sensor_fault      = sensorFault;

    supabase_sendSensorLog(payload);
}
