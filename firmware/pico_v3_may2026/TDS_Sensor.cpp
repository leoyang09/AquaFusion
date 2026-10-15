#include "TDS_Sensor.h"
#include <Arduino.h>

static const int   TDS_SAMPLES      = 30;
static const int   TDS_SAMPLE_DELAY = 10;
static const float TDS_VREF         = 3.3f;
static const int   TDS_ADC_MAX      = 4095;
static const float TDS_KVALUE       = 1.0f;

void tdsSensor_init() {

    pinMode(TDS_PIN, INPUT);
}

static float _readVoltage() {
    long total = 0;
    for (int i = 0; i < TDS_SAMPLES; i++) {
        total += analogRead(TDS_PIN);
        delay(TDS_SAMPLE_DELAY);
    }
    return ((float)total / TDS_SAMPLES) / TDS_ADC_MAX * TDS_VREF;
}

float tdsSensor_readPPM(float tempC) {
    float voltage = _readVoltage();

    float compCoeff = 1.0f + 0.02f * (tempC - 25.0f);
    float compV     = voltage / compCoeff;

    float tds = (133.42f * compV * compV * compV
               - 255.86f * compV * compV
               + 857.39f * compV)
               * 0.5f * TDS_KVALUE;

    return max(tds, 0.0f);
}

const char* tdsSensor_classify(float ppm) {
    if (ppm <  50)  return "Excellent";
    if (ppm < 150)  return "Good";
    if (ppm < 300)  return "Fair";
    if (ppm < 500)  return "Poor";
    if (ppm < 1000) return "Very Poor";
    return                 "Unsafe";
}
