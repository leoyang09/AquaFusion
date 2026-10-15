#include "PH_Sensor.h"
#include <Arduino.h>

static const float PH_NEUTRAL_VOLTAGE = 0.40f;
static const float PH_ACID_VOLTAGE    = 0.70f;

static const int   PH_SAMPLES      = 10;
static const int   PH_SAMPLE_DELAY = 10;
static const float PH_VREF         = 3.3f;
static const int   PH_ADC_MAX      = 4095;

static float _slope;

void phSensor_init() {
    pinMode(PH_PIN, INPUT);

    _slope = (7.0f - 4.0f) / (PH_NEUTRAL_VOLTAGE - PH_ACID_VOLTAGE);
}

float phSensor_readPH() {
    long sum = 0;
    for (int i = 0; i < PH_SAMPLES; i++) {
        sum += analogRead(PH_PIN);
        delay(PH_SAMPLE_DELAY);
    }
    float voltage = ((float)sum / PH_SAMPLES) * (PH_VREF / PH_ADC_MAX);
    float ph = 7.0f + (PH_NEUTRAL_VOLTAGE - voltage) * _slope;

    ph = constrain(ph, 0.0f, 14.0f);
    return ph;
}

const char* phSensor_classify(float ph) {
    if (ph < 4.0f)  return "Very Acidic";
    if (ph < 6.5f)  return "Acidic";
    if (ph < 7.5f)  return "Neutral (safe)";
    if (ph < 9.0f)  return "Alkaline";
    return                 "Very Alkaline";
}
